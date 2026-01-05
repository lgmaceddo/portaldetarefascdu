import React, { useState, useEffect, useRef } from 'react';
import { Note, Doctor, Receptionist, NoteHistory, NoteStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { useNotification } from '../contexts/NotificationContext';

// Combined Recipient type for dropdown
interface Recipient {
    id: string;
    name: string;
    description: string;
    type: 'doctor' | 'reception';
    avatar?: string; // Added avatar support
}

const Messages: React.FC = () => {
    const { user } = useAuth();
    const { playNotificationSound } = useNotification();

    // --- State ---
    const [notes, setNotes] = useState<Note[]>(() => {
        const saved = localStorage.getItem('mediportal_notes');
        return saved ? JSON.parse(saved) : [];
    });

    const [recipients, setRecipients] = useState<Recipient[]>([]);

    // Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);
    const [viewNote, setViewNote] = useState<Note | null>(null);

    // Response/Interaction State
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [interactionType, setInteractionType] = useState<'reply' | 'return'>('reply');
    const [responseText, setResponseText] = useState('');

    const [filterStatus, setFilterStatus] = useState<'active' | 'completed'>('active');

    // Create Form State
    const [formData, setFormData] = useState<Partial<Note>>({
        title: '',
        type: 'patient',
        to: '',
        patientName: '',
        patientCard: '',
        patientPhone: '',
        appointmentDate: new Date().toISOString().split('T')[0],
        content: '',
    });

    // Attachment State
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Smart Selector State ---
    const [isRecipientSelectorOpen, setIsRecipientSelectorOpen] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [recipientCategoryFilter, setRecipientCategoryFilter] = useState<'doctor' | 'reception'>('doctor');
    const recipientSelectorRef = useRef<HTMLDivElement>(null);

    // Fetch Recipients from Supabase
    const fetchRecipients = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .in('role', ['doctor', 'reception']);

            if (error) throw error;

            if (data) {
                const mappedRecipients: Recipient[] = data.map((p: any) => ({
                    id: p.id,
                    name: p.name || 'Sem Nome',
                    description: p.specialty || (p.role === 'doctor' ? 'Médico' : 'Recepção'),
                    type: p.role as 'doctor' | 'reception',
                    avatar: p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || 'U')}&background=${p.role === 'doctor' ? '00965e' : 'ef4444'}&color=fff`
                }));
                setRecipients(mappedRecipients);
            }
        } catch (error) {
            console.error('Error fetching recipients:', error);
        }
    };

    useEffect(() => {
        fetchRecipients();

        // Subscribe to profile changes
        const channel = supabase
            .channel('public:profiles:recipients')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                fetchRecipients();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('mediportal_notes', JSON.stringify(notes));
    }, [notes]);

    // Click outside listener for recipient selector
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (recipientSelectorRef.current && !recipientSelectorRef.current.contains(event.target as Node)) {
                setIsRecipientSelectorOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- Helpers ---
    const getRecipientName = (id: string) => {
        const rec = recipients.find(r => r.id === id);
        return rec ? rec.name : 'Destinatário';
    };

    const getRecipientObj = (id: string) => recipients.find(r => r.id === id);

    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    // Return full data URI
                    resolve(reader.result);
                } else {
                    reject("Failed to convert file");
                }
            };
            reader.onerror = error => reject(error);
        });
    };

    // --- Filter Logic ---
    const filteredNotes = notes.filter(note => {
        // 1. Status Filter
        if (filterStatus === 'active') {
            if (note.status === 'completed') return false;
        } else {
            if (note.status !== 'completed') return false;
        }

        // 2. Permission Filter
        if (user?.role === 'doctor') {
            // Doctor sees notes sent TO them or BY them
            return note.to === user.id || note.from === user.name;
        }
        // Reception/Admin sees everything usually
        return true;
    }).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Filter Recipients for the Smart Selector
    const filteredRecipients = recipients.filter(r => {
        const matchesCategory = r.type === recipientCategoryFilter;
        const matchesSearch = r.name.toLowerCase().includes(recipientSearch.toLowerCase()) ||
            r.description.toLowerCase().includes(recipientSearch.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // --- Action Handlers ---

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            // Limit size to 2MB for localStorage safety in this demo
            if (file.size > 2 * 1024 * 1024) {
                alert("O arquivo é muito grande. Limite de 2MB.");
                return;
            }
            setAttachmentFile(file);
        }
    };

    const handleRemoveAttachment = () => {
        setAttachmentFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleCreateNote = async () => {
        if (!formData.to || !formData.content || !formData.title) {
            alert("Por favor, preencha o Título, o Destinatário e o Conteúdo.");
            return;
        }

        let attachmentData = undefined;
        if (attachmentFile) {
            try {
                const base64Url = await convertToBase64(attachmentFile);
                attachmentData = {
                    name: attachmentFile.name,
                    type: attachmentFile.type.includes('pdf') ? 'pdf' : 'image' as 'pdf' | 'image',
                    url: base64Url
                };
            } catch (error) {
                console.error("Error converting file", error);
                alert("Erro ao processar o anexo.");
                return;
            }
        }

        const newNote: Note = {
            id: Date.now().toString(),
            title: formData.title || 'Sem Título',
            type: formData.type as 'general' | 'patient',
            from: user?.name || 'Sistema',
            to: formData.to,
            content: formData.content || '',
            status: 'pending',
            createdAt: new Date().toISOString(),
            history: [],
            attachment: attachmentData,
            ...(formData.type === 'patient' ? {
                patientName: formData.patientName,
                patientCard: formData.patientCard,
                patientPhone: formData.patientPhone,
                appointmentDate: formData.appointmentDate
            } : {})
        };

        setNotes([newNote, ...notes]);
        setIsCreateModalOpen(false);
        setFormData(prev => ({
            ...prev,
            title: '',
            to: '', // Reset recipient
            patientName: '',
            patientCard: '',
            patientPhone: '',
            content: '',
        }));
        setRecipientSearch('');
        setAttachmentFile(null);
        playNotificationSound();
    };

    const openInteractionModal = (noteId: string, type: 'reply' | 'return', e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setActiveNoteId(noteId);
        setInteractionType(type);
        setResponseText('');
        setIsResponseModalOpen(true);
    };

    const handleSubmitInteraction = () => {
        if (!activeNoteId || !responseText.trim()) return;

        const timestamp = new Date().toISOString();

        setNotes(prev => prev.map(note => {
            if (note.id !== activeNoteId) return note;

            const newHistoryItem: NoteHistory = {
                id: Date.now().toString(),
                actor: user?.role === 'doctor' ? 'doctor' : 'reception',
                actorName: user?.name || 'Usuário',
                action: interactionType,
                content: responseText,
                timestamp
            };

            const newStatus: NoteStatus = interactionType === 'reply' ? 'responded' : 'pending';

            const updatedNote = {
                ...note,
                status: newStatus,
                history: [...note.history, newHistoryItem]
            };

            if (viewNote?.id === note.id) {
                setViewNote(updatedNote);
            }

            return updatedNote;
        }));

        setIsResponseModalOpen(false);
    };

    const handleComplete = (noteId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        // Removed confirmation for immediate fluidity
        setNotes(prev => prev.map(note => {
            if (note.id !== noteId) return note;
            return {
                ...note,
                status: 'completed' as NoteStatus,
                history: [...note.history, {
                    id: Date.now().toString(),
                    actor: 'reception' as const,
                    actorName: user?.name || 'Usuário',
                    action: 'complete' as const,
                    timestamp: new Date().toISOString()
                }]
            };
        }));

        if (viewNote?.id === noteId) {
            setViewNote(null);
        }
    };

    const handleDelete = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (window.confirm("Excluir este recado permanentemente?")) {
            setNotes(prev => prev.filter(n => n.id !== id));
            if (viewNote?.id === id) setViewNote(null);
        }
    };

    const handleCardClick = (note: Note) => {
        setViewNote(note);
    };

    const renderActionButtons = (note: Note, isModal: boolean = false) => {
        const isPending = note.status === 'pending';
        const isResponded = note.status === 'responded';
        const isCompleted = note.status === 'completed';
        const isMyNote = note.to === user?.id; // Is this note directed AT me?

        return (
            <>
                {/* If I am the recipient and it's pending, I can reply */}
                {isMyNote && isPending && (
                    <button
                        type="button"
                        onClick={(e) => openInteractionModal(note.id, 'reply', e)}
                        className={`font-bold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm ${isModal
                            ? 'px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base w-full md:w-auto'
                            : 'px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs'
                            }`}
                    >
                        <span className={`material-symbols-outlined ${isModal ? 'text-xl' : 'text-sm'}`}>reply</span>
                        Responder
                    </button>
                )}

                {/* Reception Logic (assuming reception handles finalization) or sender logic */}
                {user?.role === 'reception' && isResponded && (
                    <div className={`flex gap-3 ${isModal ? 'w-full md:w-auto' : ''}`}>
                        <button
                            type="button"
                            onClick={(e) => openInteractionModal(note.id, 'return', e)}
                            className={`font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${isModal
                                ? 'flex-1 px-4 py-3 text-orange-600 bg-orange-50 hover:bg-orange-100 text-base border border-orange-200'
                                : 'p-1.5 text-orange-600 hover:bg-orange-50'
                                }`}
                            title="Devolver"
                        >
                            <span className={`material-symbols-outlined ${isModal ? 'text-xl' : ''}`}>assignment_return</span>
                            {isModal && "Devolver"}
                        </button>
                        <button
                            type="button"
                            onClick={(e) => handleComplete(note.id, e)}
                            className={`font-bold rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm ${isModal
                                ? 'flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 text-white text-base'
                                : 'px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs'
                                }`}
                        >
                            <span className={`material-symbols-outlined ${isModal ? 'text-xl' : 'text-sm'}`}>done</span>
                            Finalizar
                        </button>
                    </div>
                )}

                {user?.role === 'reception' && !isResponded && (
                    <button
                        type="button"
                        onClick={(e) => handleDelete(note.id, e)}
                        className={`font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${isModal
                            ? 'px-4 py-3 text-red-500 hover:bg-red-50 text-base border border-red-100'
                            : 'p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50'
                            }`}
                        title="Excluir"
                    >
                        <span className={`material-symbols-outlined ${isModal ? 'text-xl' : ''}`}>delete</span>
                        {isModal && "Excluir"}
                    </button>
                )}
            </>
        );
    };

    return (
        <div className="flex flex-col gap-6 h-full relative">

            {/* --- MAIN HEADER --- */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                        {user?.role === 'reception' ? 'Central de Recados' : 'Meus Recados'}
                    </h2>
                    <p className="text-gray-500">
                        {user?.role === 'reception'
                            ? 'Lista de recados e solicitações da equipe.'
                            : 'Acompanhe suas pendências e solicitações.'}
                    </p>
                </div>

                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-secondary text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                >
                    <span className="material-symbols-outlined">edit_note</span>
                    Novo Recado
                </button>
            </div>

            {/* --- LIST FILTERS --- */}
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200">
                <button
                    onClick={() => setFilterStatus('active')}
                    className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${filterStatus === 'active'
                        ? 'bg-primary text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                >
                    <span className="material-symbols-outlined text-lg">inbox</span>
                    Em Aberto
                </button>
                <button
                    onClick={() => setFilterStatus('completed')}
                    className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${filterStatus === 'completed'
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        }`}
                >
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    Arquivados
                </button>
            </div>

            {/* --- SMART LIST --- */}
            <div className="flex flex-col gap-3 pb-10">
                {filteredNotes.map((note) => {
                    const isPending = note.status === 'pending';
                    const isResponded = note.status === 'responded';
                    const isCompleted = note.status === 'completed';

                    // Determine visual status icon and color
                    let statusIcon = 'radio_button_unchecked';
                    let statusColor = 'text-gray-400 bg-gray-100';
                    let statusText = '';
                    let statusBorder = '';

                    if (isCompleted) {
                        statusIcon = 'check_circle';
                        statusColor = 'text-green-600 bg-green-50';
                        statusBorder = 'border-l-4 border-l-green-500';
                        statusText = 'Concluído';
                    } else if (isPending) {
                        statusIcon = 'schedule';
                        statusColor = 'text-orange-600 bg-orange-50';
                        statusBorder = 'border-l-4 border-l-orange-500';
                        statusText = 'Aguardando Resposta';
                    } else if (isResponded) {
                        statusIcon = 'reply';
                        statusColor = 'text-blue-600 bg-blue-50';
                        statusBorder = 'border-l-4 border-l-blue-500';
                        statusText = 'Respondido';
                    }

                    return (
                        <div
                            key={note.id}
                            onClick={() => handleCardClick(note)}
                            className={`relative bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group flex flex-col md:flex-row items-start md:items-center gap-4 ${statusBorder}`}
                        >
                            {/* Left: Status Icon */}
                            <div className="flex items-center gap-3 shrink-0">
                                <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${statusColor}`}>
                                    <span className="material-symbols-outlined text-2xl">{statusIcon}</span>
                                </div>
                                <div className="md:hidden">
                                    <span className="text-xs font-bold text-gray-500">{statusText}</span>
                                </div>
                            </div>

                            {/* Middle: Content Preview */}
                            <div className="flex-1 min-w-0 w-full">
                                <div className="flex items-center justify-between md:justify-start gap-3 mb-1">
                                    <h3 className={`font-bold text-base truncate ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                        {note.title}
                                    </h3>
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                        {new Date(note.createdAt).toLocaleDateString('pt-BR')} • {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                <p className="text-sm text-gray-600 truncate mb-2">
                                    {note.content}
                                </p>

                                <div className="flex items-center gap-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${note.type === 'patient' ? 'bg-primary-light text-primary-dark' : 'bg-gray-100 text-gray-600'}`}>
                                        {note.type === 'patient' ? 'Paciente' : 'Geral'}
                                    </span>
                                    {note.type === 'patient' && (
                                        <span className="text-xs text-gray-500 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">person</span>
                                            {note.patientName}
                                        </span>
                                    )}
                                    {note.attachment && (
                                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">attachment</span>
                                            Anexo
                                        </span>
                                    )}
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 ml-auto md:ml-0">
                                        <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                                        {getRecipientName(note.to)}
                                    </span>
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center justify-end w-full md:w-auto gap-2 border-t md:border-0 pt-3 md:pt-0 border-gray-100">
                                {/* Contextual Actions Buttons */}
                                <div className="hidden md:block">
                                    <span className="text-xs font-bold text-gray-400 block text-right mb-1">{statusText}</span>
                                    <div className="flex justify-end">{renderActionButtons(note)}</div>
                                </div>
                                {/* Mobile Actions shown via standard render if needed, but for smart list usually simplified */}
                                <div className="md:hidden w-full flex justify-end">
                                    {renderActionButtons(note)}
                                </div>

                                <span className="material-symbols-outlined text-gray-300 hidden md:block">chevron_right</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredNotes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                    <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">inbox</span>
                    <p className="text-gray-500 font-medium text-sm">Nenhum recado encontrado.</p>
                </div>
            )}

            {/* --- CREATE NOTE MODAL (Expanded Width) --- */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[95vh]">
                        {/* Header */}
                        <div className="px-8 py-5 flex justify-between items-center shrink-0 bg-[#00665C] text-white">
                            <h3 className="font-bold text-xl flex items-center gap-2">
                                <span className="material-symbols-outlined">edit_note</span>
                                Novo Recado
                            </h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-1 rounded-full hover:bg-white/20 transition-colors text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Body with Grid Layout */}
                        <div className="p-8 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                {/* Left Column: General Info */}
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tipo de Recado</label>
                                        <div className="flex bg-gray-100 p-1 rounded-lg">
                                            <button
                                                onClick={() => setFormData({ ...formData, type: 'patient' })}
                                                className={`flex-1 py-2.5 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${formData.type === 'patient' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined">personal_injury</span>
                                                Sobre Paciente
                                            </button>
                                            <button
                                                onClick={() => setFormData({ ...formData, type: 'general' })}
                                                className={`flex-1 py-2.5 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all ${formData.type === 'general' ? 'bg-white text-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined">notifications</span>
                                                Geral / Outros
                                            </button>
                                        </div>
                                    </div>

                                    {/* --- INTELLIGENT RECIPIENT SELECTOR --- */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Destinatário *</label>

                                            {/* Category Radios */}
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-1.5 cursor-pointer group select-none">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${recipientCategoryFilter === 'doctor'
                                                        ? 'bg-primary border-primary'
                                                        : 'border-gray-300 bg-white group-hover:border-primary'
                                                        }`}>
                                                        {recipientCategoryFilter === 'doctor' && <span className="material-symbols-outlined text-[10px] text-white font-bold">check</span>}
                                                    </div>
                                                    <input
                                                        type="radio"
                                                        className="hidden"
                                                        checked={recipientCategoryFilter === 'doctor'}
                                                        onChange={() => {
                                                            setRecipientCategoryFilter('doctor');
                                                            setFormData(prev => ({ ...prev, to: '' }));
                                                            setRecipientSearch('');
                                                        }}
                                                    />
                                                    <span className={`text-xs font-bold transition-colors ${recipientCategoryFilter === 'doctor' ? 'text-primary' : 'text-gray-500'}`}>MÉDICO</span>
                                                </label>

                                                <label className="flex items-center gap-1.5 cursor-pointer group select-none">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${recipientCategoryFilter === 'reception'
                                                        ? 'bg-secondary border-secondary'
                                                        : 'border-gray-300 bg-white group-hover:border-secondary'
                                                        }`}>
                                                        {recipientCategoryFilter === 'reception' && <span className="material-symbols-outlined text-[10px] text-white font-bold">check</span>}
                                                    </div>
                                                    <input
                                                        type="radio"
                                                        className="hidden"
                                                        checked={recipientCategoryFilter === 'reception'}
                                                        onChange={() => {
                                                            setRecipientCategoryFilter('reception');
                                                            setFormData(prev => ({ ...prev, to: '' }));
                                                            setRecipientSearch('');
                                                        }}
                                                    />
                                                    <span className={`text-xs font-bold transition-colors ${recipientCategoryFilter === 'reception' ? 'text-secondary' : 'text-gray-500'}`}>RECEPÇÃO</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Trigger Box (Looks like selected or placeholder) */}
                                        <div className="relative" ref={recipientSelectorRef}>
                                            <div
                                                onClick={() => setIsRecipientSelectorOpen(!isRecipientSelectorOpen)}
                                                className={`w-full p-2 border rounded-xl cursor-pointer transition-all flex items-center justify-between ${isRecipientSelectorOpen ? 'border-primary ring-2 ring-primary/10 bg-white' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                                                    }`}
                                            >
                                                {formData.to ? (
                                                    <div className="flex items-center gap-3">
                                                        {/* Selected Avatar */}
                                                        <img
                                                            src={getRecipientObj(formData.to)?.avatar}
                                                            alt="Avatar"
                                                            className="size-8 rounded-full object-cover"
                                                        />
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800 leading-tight">{getRecipientName(formData.to)}</p>
                                                            <p className="text-[10px] text-gray-500 uppercase">{getRecipientObj(formData.to)?.description}</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-500 p-1">
                                                        {recipientCategoryFilter === 'doctor' ? 'Selecione o médico...' : 'Selecione o setor/recepcionista...'}
                                                    </span>
                                                )}
                                                <span className="material-symbols-outlined text-gray-400">expand_more</span>
                                            </div>

                                            {/* Dropdown Content */}
                                            {isRecipientSelectorOpen && (
                                                <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                    {/* Search Input */}
                                                    <div className="p-3 bg-gray-50 border-b border-gray-100">
                                                        <div className="relative">
                                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                                                            <input
                                                                type="text"
                                                                placeholder={`Buscar em ${recipientCategoryFilter === 'doctor' ? 'Médicos' : 'Recepção'}...`}
                                                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary bg-white"
                                                                value={recipientSearch}
                                                                onChange={(e) => setRecipientSearch(e.target.value)}
                                                                autoFocus
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Results List */}
                                                    <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                                        {filteredRecipients.length > 0 ? (
                                                            filteredRecipients.map(recipient => (
                                                                <div
                                                                    key={recipient.id}
                                                                    onClick={() => {
                                                                        setFormData({ ...formData, to: recipient.id });
                                                                        setIsRecipientSelectorOpen(false);
                                                                        setRecipientSearch('');
                                                                    }}
                                                                    className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${formData.to === recipient.id ? 'bg-primary/10' : 'hover:bg-gray-50'
                                                                        }`}
                                                                >
                                                                    <img
                                                                        src={recipient.avatar}
                                                                        alt={recipient.name}
                                                                        className="size-9 rounded-full object-cover border border-gray-100"
                                                                    />
                                                                    <div>
                                                                        <p className="text-sm font-bold text-gray-800">{recipient.name}</p>
                                                                        <p className="text-[10px] text-gray-500 uppercase font-medium">{recipient.description}</p>
                                                                    </div>
                                                                    {formData.to === recipient.id && (
                                                                        <span className="material-symbols-outlined text-primary ml-auto">check</span>
                                                                    )}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="p-4 text-center text-gray-400 text-xs">
                                                                Nenhum cadastro encontrado.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Título do Recado *</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Encaixe, Dúvida de Medicação, Exames..."
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none font-bold text-gray-800"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase">Mensagem *</label>
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="text-xs flex items-center gap-1 text-primary font-bold hover:bg-primary-light/50 px-2 py-1 rounded transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-sm">attach_file</span>
                                                Anexar Arquivo
                                            </button>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/*,application/pdf"
                                                onChange={handleFileSelect}
                                            />
                                        </div>
                                        <textarea
                                            value={formData.content}
                                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                            className="w-full p-4 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm min-h-[150px] resize-none"
                                            placeholder="Descreva a situação detalhadamente..."
                                        ></textarea>

                                        {/* Attachment Preview Area */}
                                        {attachmentFile && (
                                            <div className="mt-3 flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                                <div className="bg-white p-2 rounded text-primary border border-gray-100 shadow-sm">
                                                    <span className="material-symbols-outlined">
                                                        {attachmentFile.type.includes('pdf') ? 'picture_as_pdf' : 'image'}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-700 truncate">{attachmentFile.name}</p>
                                                    <p className="text-[10px] text-gray-400">{(attachmentFile.size / 1024).toFixed(1)} KB</p>
                                                </div>
                                                <button
                                                    onClick={handleRemoveAttachment}
                                                    className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-colors"
                                                    title="Remover anexo"
                                                >
                                                    <span className="material-symbols-outlined text-lg">close</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Context (Patient) or Info */}
                                <div className="flex flex-col">
                                    {formData.type === 'patient' ? (
                                        <div className="bg-primary-light/30 p-6 rounded-2xl border border-primary/10 h-full flex flex-col">
                                            <div className="flex items-center gap-2 mb-4 text-primary-dark border-b border-primary/10 pb-3">
                                                <span className="material-symbols-outlined">badge</span>
                                                <h4 className="font-bold">Dados do Paciente</h4>
                                            </div>

                                            <div className="space-y-4 flex-1">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-primary/70 uppercase mb-1">Nome Completo</label>
                                                    <input
                                                        type="text"
                                                        value={formData.patientName}
                                                        onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                                                        className="w-full p-3 border border-primary/20 rounded-xl text-sm focus:border-primary outline-none"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-primary/70 uppercase mb-1">Telefone</label>
                                                        <input
                                                            type="text"
                                                            value={formData.patientPhone}
                                                            onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                                                            className="w-full p-3 border border-primary/20 rounded-xl text-sm focus:border-primary outline-none"
                                                            placeholder="(XX) XXXXX-XXXX"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-primary/70 uppercase mb-1">Data da Última Consulta</label>
                                                        <input
                                                            type="date"
                                                            value={formData.appointmentDate}
                                                            onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                                                            className="w-full p-3 border border-primary/20 rounded-xl text-sm focus:border-primary outline-none text-gray-600"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-primary/70 uppercase mb-1">Carteirinha (Opcional)</label>
                                                    <input
                                                        type="text"
                                                        value={formData.patientCard}
                                                        onChange={(e) => setFormData({ ...formData, patientCard: e.target.value })}
                                                        className="w-full p-3 border border-primary/20 rounded-xl text-sm focus:border-primary outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl h-full flex flex-col items-center justify-center text-gray-400 p-10 text-center">
                                            <span className="material-symbols-outlined text-6xl mb-4 text-gray-300">workspaces</span>
                                            <p className="font-medium">Recado Administrativo</p>
                                            <p className="text-sm mt-2">Use esta opção para comunicados gerais, avisos de laboratório ou questões internas que não envolvem um paciente específico.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-4 justify-between">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="px-8 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={handleCreateNote}
                                className="px-8 py-3 bg-secondary text-white font-bold hover:bg-gray-800 rounded-xl transition-colors shadow-lg shadow-gray-300 flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined">send</span>
                                Enviar Recado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- RESPONSE / RETURN MODAL (Widened) --- */}
            {isResponseModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col">
                        <div className={`px-8 py-5 flex justify-between items-center text-white shrink-0 ${interactionType === 'reply' ? 'bg-blue-600' : 'bg-orange-500'
                            }`}>
                            <h3 className="font-bold text-xl flex items-center gap-2">
                                <span className="material-symbols-outlined text-2xl">
                                    {interactionType === 'reply' ? 'reply' : 'assignment_return'}
                                </span>
                                {interactionType === 'reply' ? 'Responder Recado' : 'Devolver ao Remetente'}
                            </h3>
                            <button onClick={() => setIsResponseModalOpen(false)} className="p-1 rounded-full hover:bg-white/20 transition-colors text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-8">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-3">
                                {interactionType === 'reply' ? 'Sua Resposta' : 'Motivo da Devolução'}
                            </label>
                            <textarea
                                value={responseText}
                                onChange={(e) => setResponseText(e.target.value)}
                                className="w-full p-4 border border-gray-300 rounded-xl focus:border-blue-500 outline-none text-base min-h-[200px] resize-none leading-relaxed"
                                placeholder={interactionType === 'reply' ? "Digite sua resposta detalhada..." : "Explique o motivo para devolver..."}
                                autoFocus
                            ></textarea>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-4 justify-between">
                            <button
                                onClick={() => setIsResponseModalOpen(false)}
                                className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Fechar
                            </button>
                            <button
                                onClick={handleSubmitInteraction}
                                disabled={!responseText.trim()}
                                className={`px-8 py-3 text-white font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 ${!responseText.trim() ? 'bg-gray-300 cursor-not-allowed' :
                                    interactionType === 'reply' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-lg">send</span>
                                {interactionType === 'reply' ? 'Enviar Resposta' : 'Devolver'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- VIEW NOTE DETAILS MODAL --- */}
            {viewNote && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-8 py-5 flex justify-between items-center shrink-0 bg-[#00665C] text-white">
                            <h3 className="font-bold text-xl text-white">
                                Detalhes do Recado
                            </h3>
                            <button onClick={() => setViewNote(null)} className="p-1 rounded-full hover:bg-white/20 transition-colors text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-8 overflow-y-auto no-scrollbar flex-1">

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left Column: Content */}
                                <div className={`${viewNote.type === 'patient' ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
                                    <div>
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Título do Recado</label>
                                                <h2 className="text-gray-900 font-bold text-3xl leading-tight mt-1">{viewNote.title}</h2>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    Enviado em {new Date(viewNote.createdAt).toLocaleDateString()} às {new Date(viewNote.createdAt).toLocaleTimeString()}
                                                </p>
                                            </div>

                                            <span className={`px-4 py-2 rounded-xl text-sm font-bold border shadow-sm shrink-0 ${viewNote.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                                                {viewNote.status === 'pending' ? 'Pendente' : viewNote.status === 'responded' ? 'Respondido' : 'Concluído'}
                                            </span>
                                        </div>

                                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mb-8">
                                            <label className="text-xs font-bold text-gray-400 uppercase mb-3 block flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">chat</span>
                                                Mensagem
                                            </label>
                                            <p className="text-gray-800 leading-relaxed font-medium text-lg whitespace-pre-wrap">
                                                {viewNote.content}
                                            </p>
                                        </div>

                                        {/* Attachment Display */}
                                        {viewNote.attachment && (
                                            <div className="mt-4 pb-8">
                                                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm">attach_file</span>
                                                    Anexo
                                                </label>
                                                <div className="inline-flex flex-col border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white hover:shadow-md transition-shadow">
                                                    {viewNote.attachment.type === 'image' ? (
                                                        <div className="relative group cursor-pointer">
                                                            <img
                                                                src={viewNote.attachment.url}
                                                                alt={viewNote.attachment.name}
                                                                className="max-h-64 object-contain bg-gray-50"
                                                            />
                                                            <a
                                                                href={viewNote.attachment.url}
                                                                download={viewNote.attachment.name}
                                                                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity font-bold gap-2"
                                                            >
                                                                <span className="material-symbols-outlined">download</span>
                                                                Baixar Imagem
                                                            </a>
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 flex items-center gap-4 min-w-[300px]">
                                                            <div className="bg-red-50 text-red-600 p-3 rounded-lg">
                                                                <span className="material-symbols-outlined text-3xl">picture_as_pdf</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="font-bold text-gray-800 truncate max-w-[200px]">{viewNote.attachment.name}</p>
                                                                <p className="text-xs text-gray-500 uppercase">Documento PDF</p>
                                                            </div>
                                                            <a
                                                                href={viewNote.attachment.url}
                                                                download={viewNote.attachment.name}
                                                                className="bg-gray-100 hover:bg-gray-200 p-2 rounded-lg text-gray-600 transition-colors"
                                                                title="Baixar"
                                                            >
                                                                <span className="material-symbols-outlined">download</span>
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* History / Timeline */}
                                    {viewNote.history && viewNote.history.length > 0 && (
                                        <div className="border-t border-gray-100 pt-8">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-5 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">history</span>
                                                Histórico de Movimentações
                                            </h4>
                                            <div className="space-y-6">
                                                {viewNote.history.map((hist) => (
                                                    <div key={hist.id} className={`flex gap-4 ${hist.actor === 'doctor' ? 'flex-row-reverse' : ''}`}>
                                                        <div className={`size-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${hist.actor === 'doctor' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'
                                                            }`}>
                                                            <span className="material-symbols-outlined">
                                                                {hist.actor === 'doctor' ? 'stethoscope' : 'support_agent'}
                                                            </span>
                                                        </div>
                                                        <div className={`max-w-[80%] rounded-2xl p-4 text-sm shadow-sm ${hist.actor === 'doctor'
                                                            ? 'bg-blue-50 text-blue-900 rounded-tr-none border border-blue-100'
                                                            : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                                                            }`}>
                                                            <div className="flex justify-between items-baseline gap-6 mb-2 border-b border-black/5 pb-2">
                                                                <span className="font-bold text-sm">{hist.actorName}</span>
                                                                <span className="text-xs opacity-60">
                                                                    {new Date(hist.timestamp).toLocaleDateString()} {new Date(hist.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <p className="text-base leading-relaxed whitespace-pre-wrap">{hist.content}</p>
                                                            {hist.action === 'return' && <span className="block mt-2 text-xs font-bold text-orange-600 uppercase bg-orange-100 w-fit px-2 py-0.5 rounded">Devolvido</span>}
                                                            {hist.action === 'complete' && <span className="block mt-2 text-xs font-bold text-green-600 uppercase bg-green-100 w-fit px-2 py-0.5 rounded">Finalizado</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Patient Data */}
                                {viewNote.type === 'patient' && (
                                    <div className="lg:col-span-4 flex flex-col h-full">
                                        <div className="bg-primary-light/50 rounded-2xl border border-primary/20 p-6 h-full flex flex-col shadow-sm">
                                            <div className="flex items-center gap-3 text-primary-dark border-b border-primary/10 pb-4 mb-4">
                                                <div className="p-2 bg-white rounded-lg shadow-sm text-primary">
                                                    <span className="material-symbols-outlined text-xl">personal_injury</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-lg leading-none text-primary-dark">Paciente</h4>
                                                    <span className="text-xs text-primary/70 font-medium">Dados vinculados</span>
                                                </div>
                                            </div>

                                            <div className="space-y-5 flex-1">
                                                <div>
                                                    <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Nome Completo</label>
                                                    <p className="text-gray-900 font-bold text-xl mt-1 leading-tight">{viewNote.patientName || '-'}</p>
                                                </div>

                                                <div className="flex flex-col gap-4">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-1">
                                                            Carteirinha
                                                            <span className="material-symbols-outlined text-[10px] text-primary/40">badge</span>
                                                        </label>
                                                        <p className="font-mono text-base font-medium bg-white px-3 py-2 rounded-lg border border-primary/20 text-gray-800 w-full shadow-sm tracking-wide mt-1">
                                                            {viewNote.patientCard || '-'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-1">
                                                            Última Consulta
                                                            <span className="material-symbols-outlined text-[10px] text-primary/40">calendar_month</span>
                                                        </label>
                                                        <p className="text-gray-900 font-bold text-sm mt-1 ml-1">
                                                            {viewNote.appointmentDate ? new Date(viewNote.appointmentDate).toLocaleDateString('pt-BR') : '-'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="pt-2 border-t border-primary/10 mt-2">
                                                    <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Contato</label>
                                                    <a href={`tel:${viewNote.patientPhone}`} className="flex items-center gap-2 text-gray-800 font-bold mt-2 hover:text-primary transition-colors bg-white/60 p-2 rounded-lg">
                                                        <span className="material-symbols-outlined text-lg text-primary">call</span>
                                                        {viewNote.patientPhone || '-'}
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-4 justify-between items-center shrink-0">
                            <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-1">De</span>
                                    <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{viewNote.from}</span>
                                </div>
                                <span className="material-symbols-outlined text-gray-300 text-lg">arrow_forward</span>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-1">Para</span>
                                    <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{getRecipientName(viewNote.to)}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewNote(null)}
                                    className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors border border-gray-200 bg-white"
                                >
                                    Fechar
                                </button>
                                {renderActionButtons(viewNote, true)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Messages;