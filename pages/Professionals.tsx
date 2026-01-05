import React, { useState, useEffect } from 'react';
import { Doctor } from '../types';
import { supabase } from '../services/supabase';

// Mock data
const INITIAL_DOCTORS: Doctor[] = [
    { id: 'd1', name: 'Dr. Ricardo Silva', specialty: 'Cardiologia', phone: '(14) 99881-0001', avatar: '', color: '', status: 'active' },
    { id: 'd2', name: 'Dra. Ana Souza', specialty: 'Pediatria', phone: '(14) 99881-0002', avatar: '', color: '', status: 'active' },
    { id: 'd3', name: 'Dr. Paulo Mendes', specialty: 'Ultrassom', phone: '(14) 99881-0003', avatar: '', color: '', status: 'vacation' },
    { id: 'd4', name: 'Dra. Carla Diaz', specialty: 'Dermatologia', phone: '(14) 99881-0004', avatar: '', color: '', status: 'active' },
    { id: 'd5', name: 'Dr. Roberto Cruz', specialty: 'Ortopedia', phone: '(14) 99881-0005', avatar: '', color: '', status: 'inactive' },
    { id: 'd6', name: 'Dra. Fernanda Lima', specialty: 'Ginecologia', phone: '(14) 99881-0006', avatar: '', color: '', status: 'active' },
];

const Professionals: React.FC = () => {
    const [professionals, setProfessionals] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Fetch Data from Supabase
    const fetchProfessionals = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'doctor');

            if (error) throw error;

            if (data) {
                // Map Supabase profile to Doctor type
                const mappedDoctors: Doctor[] = data.map((p: any) => ({
                    id: p.id,
                    name: p.name || 'Sem Nome',
                    specialty: p.specialty || 'Geral',
                    phone: p.phone || '', // Need to ensure phone exists in Schema? I might need to add it or use raw_meta
                    avatar: p.avatar || '',
                    status: (p.status as any) || 'active',
                    color: '',
                    gender: p.gender
                }));
                setProfessionals(mappedDoctors);
            }
        } catch (error) {
            console.error('Error fetching professionals:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfessionals();

        // Subscribe to realtime changes
        const channel = supabase
            .channel('public:profiles:doctor')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'role=eq.doctor' }, (payload: any) => {
                fetchProfessionals(); // Refresh on any change
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        }
    }, []);

    // Handlers
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
    };

    const filtered = professionals.filter((p: Doctor) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.specialty.toLowerCase().includes(search.toLowerCase())
    );

    // --- Helpers for Design Logic ---

    const getInitials = (name: string) => {
        // Remove titles like Dr, Dra, Dr., Dra., DRº, DRª to get real initials
        const cleanName = name.replace(/^(dr|dra|dr\.|dra\.|drº|drª)\s+/i, '').trim();
        const parts = cleanName.split(' ');

        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const getStyleByName = (name: string, gender?: string) => {
        const isFemale = gender === 'female' || name.toLowerCase().includes('dra');

        if (isFemale) {
            return {
                bg: 'bg-purple-50',
                text: 'text-purple-700',
                borderLeft: 'border-l-purple-400',
                iconBg: 'bg-purple-100',
                iconText: 'text-purple-600'
            };
        }
        // Male (Portal Green Theme)
        return {
            bg: 'bg-primary-light', // e5f4ee
            text: 'text-primary-dark', // 007a4b
            borderLeft: 'border-l-primary',
            iconBg: 'bg-white',
            iconText: 'text-primary'
        };
    };

    const getStatusDotColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-500';
            case 'inactive': return 'bg-gray-300';
            case 'vacation': return 'bg-yellow-400';
            default: return 'bg-gray-300';
        }
    };

    return (
        <div className="flex flex-col gap-6 h-full">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Profissionais</h2>
                    <p className="text-gray-500">Gestão do corpo clínico e status.</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar médico..."
                            value={search}
                            onChange={handleSearch}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                        />
                    </div>
                    {/* Read-Only View: No Add Button */}
                </div>
            </div>

            {/* Grid Layout: Up to 6 cards per line on 2xl screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 pb-6">
                {filtered.map(professional => {
                    const style = getStyleByName(professional.name, professional.gender);

                    return (
                        <div
                            key={professional.id}
                            className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col border border-gray-100 border-l-[6px] ${style.borderLeft}`}
                        >
                            <div className="p-4 flex flex-col gap-3 h-full">
                                {/* Header: Initials + Name */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        {/* Initials Circle */}
                                        <div className={`size-11 shrink-0 rounded-full flex items-center justify-center font-bold text-sm tracking-widest ${style.bg} ${style.text} relative`}>
                                            {getInitials(professional.name)}
                                            {/* Status Dot attached to avatar */}
                                            <div className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-white ${getStatusDotColor(professional.status)}`}></div>
                                        </div>

                                        {/* Name & Specialty */}
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-gray-800 text-sm leading-tight truncate" title={professional.name}>
                                                {professional.name}
                                            </h3>
                                            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mt-0.5 truncate">
                                                {professional.specialty}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Actions Removed for Read-Only */}
                                </div>

                                {/* Footer: Phone */}
                                <div className="mt-auto pt-3 border-t border-gray-50 flex items-center justify-between">
                                    {professional.phone ? (
                                        <a
                                            href={`tel:${professional.phone}`}
                                            className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-primary transition-colors bg-gray-50 px-2 py-1.5 rounded-lg w-full"
                                        >
                                            <span className={`material-symbols-outlined text-sm ${style.iconText}`}>call</span>
                                            {professional.phone}
                                        </a>
                                    ) : (
                                        <span className="text-[10px] text-gray-400 italic px-2 py-1.5">Sem contato</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-5xl mb-2 opacity-20">person_search</span>
                    <p>Nenhum profissional encontrado.</p>
                </div>
            )}

            {/* Modal Removed */}
        </div>
    );
};

export default Professionals;