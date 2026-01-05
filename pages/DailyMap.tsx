import React, { useState, useEffect, useRef } from 'react';
import { Doctor } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

// --- Types Local to this Component ---
interface Room {
    id: string;
    name: string;
    extension?: string;
}

interface AllocationRecord {
    id: string;
    roomId: string;
    date: string; // YYYY-MM-DD
    shift: 'morning' | 'afternoon';
    doctorId: string;
}

const DEFAULT_ROOMS: Room[] = [
    { id: 'r1', name: 'Sala 01', extension: '201' },
    { id: 'r2', name: 'Sala 02', extension: '202' },
    { id: 'r3', name: 'Sala 03', extension: '203' },
    { id: 'r4', name: 'Sala 04', extension: '204' },
    { id: 'r5', name: 'Sala 05', extension: '205' },
    { id: 'r6', name: 'Sala 06', extension: '206' },
    { id: 'r7', name: 'Sala 07', extension: '207' },
    { id: 'r8', name: 'Sala 08', extension: '208' },
    { id: 'r9', name: 'Peq. Cirurgias', extension: '300' },
    { id: 'r10', name: 'Gesso', extension: '301' },
    { id: 'r11', name: 'Triagem 01', extension: '101' },
    { id: 'r12', name: 'Triagem 02', extension: '102' },
    { id: 'r13', name: 'Ultrassom 01', extension: '401' },
    { id: 'r14', name: 'Ultrassom 02', extension: '402' },
];

const DailyMap: React.FC = () => {
    const { user } = useAuth();
    // Permission Check: Doctors can only view, not edit
    const canEdit = user?.role !== 'doctor';

    // --- State ---
    const [currentDate, setCurrentDate] = useState<Date>(new Date());

    const [rooms, setRooms] = useState<Room[]>(() => {
        const saved = localStorage.getItem('mediportal_rooms');
        return saved ? JSON.parse(saved) : DEFAULT_ROOMS;
    });

    const [allocations, setAllocations] = useState<AllocationRecord[]>(() => {
        const saved = localStorage.getItem('mediportal_allocations');
        return saved ? JSON.parse(saved) : [];
    });

    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Ref specifically for the visible report inside the modal
    const reportRef = useRef<HTMLDivElement>(null);

    // Fetch Doctors from Supabase
    const fetchDoctors = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'doctor');

            if (error) throw error;

            if (data) {
                const mapped: Doctor[] = data.map((p: any) => ({
                    id: p.id,
                    name: p.name || 'Sem Nome',
                    specialty: p.specialty || 'Médico',
                    phone: p.phone || '',
                    avatar: p.avatar || '',
                    color: p.color || '',
                    status: (p.status as any) || 'active',
                    isAdmin: p.is_admin
                }));
                setDoctors(mapped);
            }
        } catch (error) {
            console.error('Error fetching doctors:', error);
        }
    };

    useEffect(() => {
        fetchDoctors();

        // Subscribe to realtime changes
        const channel = supabase
            .channel('public:profiles:doctors_map')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'role=eq.doctor' }, () => {
                fetchDoctors();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Modals State
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);

    // Selection State for Allocation
    const [selectedSlot, setSelectedSlot] = useState<{ roomId: string, shift: 'morning' | 'afternoon' } | null>(null);

    // Inputs for Room Management
    const [roomForm, setRoomForm] = useState({ name: '', extension: '' });
    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

    // --- Effects ---
    useEffect(() => {
        localStorage.setItem('mediportal_rooms', JSON.stringify(rooms));
    }, [rooms]);

    useEffect(() => {
        localStorage.setItem('mediportal_allocations', JSON.stringify(allocations));
    }, [allocations]);

    // --- Helpers ---
    const formatDateKey = (date: Date) => date.toISOString().split('T')[0];
    const dateKey = formatDateKey(currentDate);

    const formatDisplayDate = (date: Date) => {
        return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    const getAllocation = (roomId: string, shift: 'morning' | 'afternoon') => {
        return allocations.find(a => a.roomId === roomId && a.date === dateKey && a.shift === shift);
    };

    const getDoctor = (doctorId: string) => doctors.find(d => d.id === doctorId);

    // --- Visual Helpers (Initials & Styles) ---
    const getInitials = (name: string) => {
        const cleanName = name.replace(/^(dr|dra|dr\.|dra\.)\s+/i, '').trim();
        const parts = cleanName.split(' ');
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const getDoctorStyle = (name: string) => {
        const isFemale = name.toLowerCase().startsWith('dra');
        if (isFemale) {
            return {
                bg: 'bg-purple-50',
                text: 'text-purple-900', // Lilás Escuro
                border: 'border-purple-200'
            };
        }
        return {
            bg: 'bg-blue-50',
            text: 'text-blue-900', // Azul Escuro
            border: 'border-blue-200'
        };
    };

    // --- Handlers ---
    const changeDate = (days: number) => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate);
    };

    const handleDownloadPDF = async () => {
        const element = reportRef.current;
        if (!element) {
            console.error("Report reference not found");
            return;
        }

        // Indicate start
        setIsGeneratingPdf(true);

        // Small timeout to allow UI to update to "Gerando..." state before heavy canvas work freezes the main thread
        setTimeout(async () => {
            try {
                // Wait specifically for fonts to be ready to avoid blank text
                await document.fonts.ready;

                const canvas = await html2canvas(element, {
                    scale: 2, // High resolution (approx 192 DPI)
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff', // Force white background
                    width: 1123,
                    height: 794,
                    // These window dimensions ensure we capture the layout as defined in CSS
                    windowWidth: 1123,
                    windowHeight: 794,
                });

                const imgData = canvas.toDataURL('image/png');

                // 'l' = Landscape, 'mm', 'a4'
                const pdf = new jsPDF('l', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth(); // 297mm
                const pdfHeight = pdf.internal.pageSize.getHeight(); // 210mm

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                pdf.save(`mapa_diario_${formatDateKey(currentDate)}.pdf`);

            } catch (error) {
                console.error('Error generating PDF:', error);
                alert('Erro ao gerar o PDF. Tente novamente.');
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 100);
    };

    // Room & Allocation Management Handlers
    const handleSaveRoom = () => {
        if (!roomForm.name.trim()) return;
        if (editingRoomId) {
            setRooms(prev => prev.map(room =>
                room.id === editingRoomId ? { ...room, name: roomForm.name, extension: roomForm.extension } : room
            ));
            setEditingRoomId(null);
        } else {
            setRooms([...rooms, { id: Date.now().toString(), name: roomForm.name, extension: roomForm.extension }]);
        }
        setRoomForm({ name: '', extension: '' });
    };

    const handleEditRoom = (room: Room) => {
        setRoomForm({ name: room.name, extension: room.extension || '' });
        setEditingRoomId(room.id);
    };

    const handleCancelEdit = () => {
        setRoomForm({ name: '', extension: '' });
        setEditingRoomId(null);
    }

    const handleDeleteRoom = (id: string) => {
        if (window.confirm('Tem certeza? Isso removerá o histórico de agendamentos desta sala.')) {
            setRooms(rooms.filter(r => r.id !== id));
            setAllocations(allocations.filter(a => a.roomId !== id));
            if (editingRoomId === id) handleCancelEdit();
        }
    };

    const openAllocationModal = (roomId: string, shift: 'morning' | 'afternoon') => {
        // Basic guard clause, although UI should prevent this too
        if (!canEdit) return;
        setSelectedSlot({ roomId, shift });
        setDoctorSearch(''); // Reset search
        setShowAllocationModal(true);
    };

    const handleAssignDoctor = (doctorId: string) => {
        if (!selectedSlot) return;
        const cleanAllocations = allocations.filter(a =>
            !(a.roomId === selectedSlot.roomId && a.date === dateKey && a.shift === selectedSlot.shift)
        );
        const newAllocation: AllocationRecord = {
            id: Date.now().toString(),
            roomId: selectedSlot.roomId,
            date: dateKey,
            shift: selectedSlot.shift,
            doctorId
        };
        setAllocations([...cleanAllocations, newAllocation]);
        setShowAllocationModal(false);
    };

    const handleClearSlot = () => {
        if (!selectedSlot) return;
        const cleanAllocations = allocations.filter(a =>
            !(a.roomId === selectedSlot.roomId && a.date === dateKey && a.shift === selectedSlot.shift)
        );
        setAllocations(cleanAllocations);
        setShowAllocationModal(false);
    }

    // --- RENDER CONTENT FOR REPORT (A4 Landscape Layout) ---
    // Using isPdf true to force print layout styles
    const ReportContent = ({ isPdf = false }: { isPdf?: boolean }) => (
        <div className={`w-full h-full bg-white font-sans flex flex-col p-6 box-border relative ${isPdf ? 'text-gray-900' : 'text-gray-900'}`}>

            {/* Watermark for PDF */}
            {isPdf && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
                    <span className="material-symbols-outlined text-[400px]">local_hospital</span>
                </div>
            )}

            {/* Header */}
            <div className={`mb-4 flex justify-between items-center shrink-0 border-b-2 pb-3 ${isPdf ? 'border-primary' : 'border-gray-200'}`}>
                <div className="flex items-center gap-4">
                    <div className={`${isPdf ? 'bg-primary text-white' : 'bg-primary text-white'} p-2 rounded-lg`}>
                        <span className="material-symbols-outlined text-4xl">local_hospital</span>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold leading-none tracking-tight text-gray-800">Mapa Diário de Alocação</h1>
                        <p className={`text-sm mt-1 font-medium ${isPdf ? 'text-gray-600' : 'text-gray-500'}`}>MediPortal Unimed - Controle Interno de Salas</p>
                    </div>
                </div>
                <div className={`text-right px-6 py-2 rounded-lg border ${isPdf ? 'bg-gray-50 border-gray-200' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-xs uppercase tracking-wider font-bold ${isPdf ? 'text-gray-500' : 'text-gray-500'}`}>Data de Referência</p>
                    <p className={`text-xl font-bold capitalize leading-none mt-0.5 ${isPdf ? 'text-primary-dark' : 'text-primary'}`}>{formatDisplayDate(currentDate)}</p>
                </div>
            </div>

            {/* PRINT GRID: 6 Columns fixed (Matches Professionals View) */}
            {/* We use content-start to pack them at the top. Since cards are taller now, this fills the page better. */}
            <div className="grid grid-cols-6 gap-4 content-start relative z-10">
                {rooms.map((room) => {
                    const morning = getAllocation(room.id, 'morning');
                    const afternoon = getAllocation(room.id, 'afternoon');
                    const docMorning = morning ? getDoctor(morning.doctorId) : null;
                    const docAfternoon = afternoon ? getDoctor(afternoon.doctorId) : null;

                    // Color logic
                    const styleMorning = docMorning ? getDoctorStyle(docMorning.name) : { text: 'text-gray-900' };
                    const styleAfternoon = docAfternoon ? getDoctorStyle(docAfternoon.name) : { text: 'text-gray-900' };

                    // For PDF, we create a very clean look
                    return (
                        <div key={room.id} className={`border rounded-lg overflow-hidden flex flex-col bg-white shadow-sm h-[180px] ${isPdf ? 'border-gray-300' : 'border-gray-300'}`}>
                            {/* Header */}
                            <div className={`px-3 py-2 border-b flex justify-between items-center shrink-0 ${isPdf ? 'bg-gray-100 border-gray-300' : 'bg-gray-100 border-gray-200'}`}>
                                <span className={`font-bold text-xs uppercase ${isPdf ? 'text-gray-800' : 'text-gray-900 truncate'}`}>{room.name}</span>
                                {room.extension && (
                                    <span className={`text-[10px] font-bold ${isPdf ? 'text-gray-700 bg-white' : 'text-gray-900 bg-white'}`}>RAMAL: {room.extension}</span>
                                )}
                            </div>

                            {/* Shifts */}
                            <div className={`flex-1 flex flex-col divide-y ${isPdf ? 'divide-gray-300' : 'divide-gray-200'}`}>
                                {/* Morning */}
                                <div className="flex-1 px-3 py-2 flex flex-col justify-center bg-white relative">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isPdf ? 'text-gray-400' : 'text-primary opacity-80'}`}>Manhã</span>
                                        {!docMorning && <span className="text-[9px] text-gray-300 italic">Livre</span>}
                                    </div>
                                    {docMorning && (
                                        <div className="w-full">
                                            {/* Simplified View: No initials, Uppercase name */}
                                            <p className={`font-bold text-xs leading-tight uppercase ${isPdf ? '' : 'truncate'} ${styleMorning.text}`}>{docMorning.name}</p>
                                            <p className={`text-[9px] mt-0.5 font-medium text-gray-600 ${isPdf ? '' : 'truncate'}`}>{docMorning.specialty}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Afternoon */}
                                <div className={`flex-1 px-3 py-2 flex flex-col justify-center relative ${isPdf ? 'bg-gray-50' : 'bg-gray-50'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isPdf ? 'text-gray-400' : 'text-primary opacity-80'}`}>Tarde</span>
                                        {!docAfternoon && <span className="text-[9px] text-gray-300 italic">Livre</span>}
                                    </div>
                                    {docAfternoon && (
                                        <div className="w-full">
                                            <p className={`font-bold text-xs leading-tight uppercase ${isPdf ? '' : 'truncate'} ${styleAfternoon.text}`}>{docAfternoon.name}</p>
                                            <p className={`text-[9px] mt-0.5 font-medium text-gray-600 ${isPdf ? '' : 'truncate'}`}>{docAfternoon.specialty}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-auto pt-4 flex justify-between items-end text-[10px] text-gray-400 border-t border-gray-200">
                <div>
                    <p className="font-bold text-gray-500">MediPortal Unimed</p>
                    <p>Documento de uso interno.</p>
                </div>
                <div className="text-right">
                    <p>Gerado em: {new Date().toLocaleString()}</p>
                    <p>Página 1 de 1</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-6 h-full relative">
            {/* --- HEADER (Screen Only) --- */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Mapa Diário de Salas</h2>
                    <p className="text-gray-500">Gestão visual de ocupação ({rooms.length} Salas).</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Only show "Gerenciar Salas" if current user is NOT a doctor */}
                    {canEdit && (
                        <button
                            onClick={() => setShowRoomModal(true)}
                            className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">settings</span>
                            Gerenciar Salas
                        </button>
                    )}
                    <button
                        onClick={() => setShowReportModal(true)}
                        className="bg-secondary text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <span className="material-symbols-outlined text-lg">print</span>
                        Visualizar / PDF
                    </button>
                </div>
            </div>

            {/* --- DATE NAVIGATOR (Screen Only) --- */}
            <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between max-w-md mx-auto w-full">
                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                    <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <div className="flex flex-col items-center">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{currentDate.getFullYear()}</span>
                    <span className="text-lg font-bold text-primary capitalize">{formatDisplayDate(currentDate).split(',')[0]}</span>
                    <span className="text-xs text-gray-500">{formatDisplayDate(currentDate).split(',')[1]}</span>
                </div>
                <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                    <span className="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            {/* --- MAIN GRID (Screen View) - UPDATED TO 6 COLS --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pb-10">
                {rooms.map((room) => {
                    const morning = getAllocation(room.id, 'morning');
                    const afternoon = getAllocation(room.id, 'afternoon');
                    const docMorning = morning ? getDoctor(morning.doctorId) : null;
                    const docAfternoon = afternoon ? getDoctor(afternoon.doctorId) : null;

                    // Color logic
                    const styleMorning = docMorning ? getDoctorStyle(docMorning.name) : { text: 'text-gray-900' };
                    const styleAfternoon = docAfternoon ? getDoctorStyle(docAfternoon.name) : { text: 'text-gray-900' };

                    return (
                        <div key={room.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col transition-all hover:shadow-md group h-full">
                            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center group-hover:bg-primary-light/30 transition-colors h-10">
                                <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                                    <span className="font-bold text-gray-800 text-xs truncate" title={room.name}>
                                        {room.name}
                                    </span>
                                </div>
                                {/* Repositioned RAMAL info to the right, removing the dots */}
                                {room.extension && (
                                    <span className="text-gray-500 text-[10px] font-bold shrink-0 tracking-wide uppercase" title={`Ramal: ${room.extension}`}>
                                        RAMAL: {room.extension}
                                    </span>
                                )}
                            </div>

                            <div className="divide-y divide-gray-100 flex-1 flex flex-col">
                                {/* Morning Slot */}
                                <div
                                    onClick={() => canEdit && openAllocationModal(room.id, 'morning')}
                                    className={`p-2 transition-colors relative flex-1 min-h-[70px] flex flex-col justify-center ${canEdit ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
                                >
                                    <span className="absolute top-1 right-1 text-[8px] font-bold text-primary-dark uppercase tracking-wider bg-primary-light/50 border border-primary/10 px-1 rounded">Manhã</span>
                                    {docMorning ? (
                                        <div className="flex flex-col justify-center h-full mt-1 animate-in fade-in w-full">
                                            <p className={`font-bold text-xs leading-tight truncate uppercase ${styleMorning.text}`} title={docMorning.name}>{docMorning.name}</p>
                                            <p className="text-[10px] text-gray-500 font-medium truncate">{docMorning.specialty}</p>
                                        </div>
                                    ) : (
                                        // Show "Add" icon only if user can edit
                                        canEdit && (
                                            <div className="flex flex-col items-center justify-center mt-2 text-gray-200 group/slot">
                                                <span className="material-symbols-outlined text-lg group-hover/slot:text-primary transition-colors">add</span>
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Afternoon Slot */}
                                <div
                                    onClick={() => canEdit && openAllocationModal(room.id, 'afternoon')}
                                    className={`p-2 transition-colors relative flex-1 min-h-[70px] flex flex-col justify-center bg-gray-50/20 ${canEdit ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
                                >
                                    <span className="absolute top-1 right-1 text-[8px] font-bold text-primary-dark uppercase tracking-wider bg-primary-light/50 border border-primary/10 px-1 rounded">Tarde</span>
                                    {docAfternoon ? (
                                        <div className="flex flex-col justify-center h-full mt-1 animate-in fade-in w-full">
                                            <p className={`font-bold text-xs leading-tight truncate uppercase ${styleAfternoon.text}`} title={docAfternoon.name}>{docAfternoon.name}</p>
                                            <p className="text-[10px] text-gray-500 font-medium truncate">{docAfternoon.specialty}</p>
                                        </div>
                                    ) : (
                                        // Show "Add" icon only if user can edit
                                        canEdit && (
                                            <div className="flex flex-col items-center justify-center mt-2 text-gray-200 group/slot">
                                                <span className="material-symbols-outlined text-lg group-hover/slot:text-primary transition-colors">add</span>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- PREVIEW MODAL --- */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-gray-200 rounded-xl shadow-2xl w-full max-w-[1200px] h-[90vh] flex flex-col relative overflow-hidden">
                        <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">print</span>
                                Visualização de Impressão (A4 Paisagem)
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowReportModal(false)}
                                    className="px-4 py-2 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-lg transition-colors"
                                    disabled={isGeneratingPdf}
                                >
                                    Fechar
                                </button>
                                <button
                                    onClick={handleDownloadPDF}
                                    disabled={isGeneratingPdf}
                                    className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm transition-all duration-300 ${isGeneratingPdf
                                        ? 'bg-gray-400 text-white cursor-not-allowed scale-95'
                                        : 'bg-primary hover:bg-primary-dark text-white hover:shadow-md'
                                        }`}
                                >
                                    {isGeneratingPdf ? (
                                        <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-lg">download</span>
                                    )}
                                    {isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}
                                </button>
                            </div>
                        </div>

                        {/* Preview Container */}
                        <div className="flex-1 overflow-auto p-8 flex justify-center bg-gray-500/10">
                            {/* Capture visible element directly for 1:1 match */}
                            <div
                                ref={reportRef}
                                className="bg-white shadow-lg mx-auto"
                                style={{
                                    width: '1123px',
                                    height: '794px',
                                    minWidth: '1123px',
                                    minHeight: '794px'
                                }}
                            >
                                <ReportContent isPdf={true} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ROOM MANAGER MODAL --- */}
            {showRoomModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">
                                {editingRoomId ? 'Editar Sala' : 'Gerenciar Salas'}
                            </h3>
                            <button
                                onClick={() => { setShowRoomModal(false); handleCancelEdit(); }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto">
                            <div className="flex gap-2 mb-6 items-end">
                                <div className="flex-1 space-y-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Nome da Sala</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Sala 01"
                                            value={roomForm.name}
                                            onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                                            onKeyPress={(e) => e.key === 'Enter' && handleSaveRoom()}
                                        />
                                    </div>
                                </div>
                                <div className="w-24 space-y-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Ramal</label>
                                        <input
                                            type="text"
                                            placeholder="123"
                                            value={roomForm.extension}
                                            onChange={(e) => setRoomForm({ ...roomForm, extension: e.target.value })}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none"
                                            onKeyPress={(e) => e.key === 'Enter' && handleSaveRoom()}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-1">
                                    {editingRoomId && (
                                        <button
                                            onClick={handleCancelEdit}
                                            className="bg-gray-200 text-gray-600 px-3 py-2 rounded-lg font-bold hover:bg-gray-300 transition-colors h-[38px] flex items-center"
                                        >
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={handleSaveRoom}
                                        disabled={!roomForm.name.trim()}
                                        className={`px-3 py-2 rounded-lg font-bold transition-colors text-white h-[38px] flex items-center ${editingRoomId ? 'bg-blue-500 hover:bg-blue-600' : 'bg-primary hover:bg-primary-dark disabled:bg-gray-300'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined">{editingRoomId ? 'save' : 'add'}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {rooms.map(room => (
                                    <div key={room.id} className={`flex justify-between items-center p-3 rounded-lg border transition-colors ${editingRoomId === room.id ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                                        }`}>
                                        <div>
                                            <span className="font-bold text-gray-700 text-sm block">{room.name}</span>
                                            {room.extension ? (
                                                <span className="text-[10px] text-gray-500 font-bold bg-white px-1.5 rounded border border-gray-100">Ramal: {room.extension}</span>
                                            ) : (
                                                <span className="text-[10px] text-gray-400 italic">Sem ramal</span>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleEditRoom(room)}
                                                className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 p-1 rounded transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteRoom(room.id)}
                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ALLOCATION MODAL --- */}
            {showAllocationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-primary text-white">
                            <h3 className="font-bold">Alocar Médico</h3>
                            <p className="text-xs opacity-80">
                                {rooms.find(r => r.id === selectedSlot?.roomId)?.name} • {selectedSlot?.shift === 'morning' ? 'Manhã' : 'Tarde'}
                            </p>
                        </div>
                        <div className="p-2 max-h-[60vh] overflow-y-auto">
                            <div className="mb-2 px-2 pt-2">
                                <input
                                    type="text"
                                    placeholder="Buscar profissional..."
                                    value={doctorSearch}
                                    onChange={(e) => setDoctorSearch(e.target.value)}
                                    className="w-full text-sm p-2 border border-gray-200 rounded-lg focus:border-primary outline-none bg-gray-50"
                                />
                            </div>
                            {(() => {
                                const filtered = doctors.filter(d =>
                                    d.name.toLowerCase().includes(doctorSearch.toLowerCase()) ||
                                    d.specialty.toLowerCase().includes(doctorSearch.toLowerCase())
                                );

                                if (filtered.length > 0) {
                                    return filtered.map(doctor => {
                                        const style = getDoctorStyle(doctor.name);
                                        return (
                                            <button
                                                key={doctor.id}
                                                onClick={() => handleAssignDoctor(doctor.id)}
                                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-50 last:border-0 text-left group"
                                            >
                                                <div className={`size-10 rounded-full flex items-center justify-center font-bold text-xs tracking-wider border bg-white ${style.text} ${style.bg} ${style.border}`}>
                                                    {getInitials(doctor.name)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-gray-800 truncate">{doctor.name}</p>
                                                    <p className="text-xs text-gray-500 truncate">{doctor.specialty}</p>
                                                </div>
                                                <span className="material-symbols-outlined text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">add_circle</span>
                                            </button>
                                        );
                                    });
                                }

                                return (
                                    <div className="text-center py-4 text-gray-400 text-xs">
                                        Nenhum profissional encontrado.
                                    </div>
                                );
                            })()}

                            {selectedSlot && getAllocation(selectedSlot.roomId, selectedSlot.shift) && (
                                <button
                                    onClick={handleClearSlot}
                                    className="w-full mt-2 p-3 text-red-500 font-bold text-sm hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">block</span>
                                    Liberar Horário
                                </button>
                            )}
                        </div>
                        <div className="p-3 border-t border-gray-100 bg-gray-50 text-center">
                            <button onClick={() => setShowAllocationModal(false)} className="text-gray-500 text-sm font-bold hover:text-gray-700">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DailyMap;