import React, { useState, useEffect } from 'react';
import { Receptionist } from '../../types';
import { supabase } from '../services/supabase';

const Receptionists: React.FC = () => {
    const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Fetch Data
    const fetchReceptionists = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'reception');

            if (error) throw error;

            if (data) {
                const mapped: Receptionist[] = data.map(p => ({
                    id: p.id,
                    name: p.name || 'Sem Nome',
                    sector: p.specialty || 'Geral', // Map specialty to sector
                    phone: p.phone || '',
                    avatar: p.avatar || '',
                    status: (p.status as any) || 'active',
                }));
                setReceptionists(mapped);
            }
        } catch (error) {
            console.error('Error fetching receptionists:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReceptionists();

        // Subscribe to realtime changes
        const channel = supabase
            .channel('public:profiles:reception')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'role=eq.reception' }, (payload) => {
                fetchReceptionists();
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

    const filtered = receptionists.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.sector.toLowerCase().includes(search.toLowerCase())
    );

    // --- Design Helpers ---

    const getSectorColor = (sector: string) => {
        const s = sector.toLowerCase();
        if (s.includes('administrativo') || s.includes('financeiro')) return 'bg-blue-100 text-blue-700 border-blue-200';
        if (s.includes('recepção') || s.includes('atendimento')) return 'bg-green-100 text-green-700 border-green-200';
        if (s.includes('triagem') || s.includes('enfermagem')) return 'bg-red-100 text-red-700 border-red-200';
        return 'bg-gray-100 text-gray-700 border-gray-200';
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
                    <h2 className="text-2xl font-bold text-gray-900">Equipe de Recepção</h2>
                    <p className="text-gray-500">Gestão de colaboradores e setores.</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar colaborador..."
                            value={search}
                            onChange={handleSearch}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                        />
                    </div>
                    {/* Read-Only: No Add Button */}
                </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
                {filtered.map(receptionist => (
                    <div
                        key={receptionist.id}
                        className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col border border-gray-100"
                    >
                        <div className="p-5 flex flex-col gap-4 h-full">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {/* Initials & Status */}
                                    <div className="size-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-lg relative shrink-0">
                                        {receptionist.avatar ? (
                                            <img src={receptionist.avatar} alt={receptionist.name} className="w-full h-full object-cover rounded-full" />
                                        ) : (
                                            receptionist.name.substring(0, 2).toUpperCase()
                                        )}
                                        <div className={`absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-white ${getStatusDotColor(receptionist.status)}`}></div>
                                    </div>

                                    {/* Info */}
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-800 text-base leading-tight truncate" title={receptionist.name}>
                                            {receptionist.name}
                                        </h3>
                                        <div className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getSectorColor(receptionist.sector)}`}>
                                            {receptionist.sector}
                                        </div>
                                    </div>
                                </div>
                                {/* Actions Removed for Read-Only */}
                            </div>

                            {/* Contact Info */}
                            <div className="mt-auto pt-3 border-t border-gray-50">
                                {receptionist.phone ? (
                                    <a
                                        href={`tel:${receptionist.phone}`}
                                        className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-primary transition-colors bg-gray-50 px-3 py-2 rounded-lg"
                                    >
                                        <span className="material-symbols-outlined text-sm">call</span>
                                        {receptionist.phone}
                                    </a>
                                ) : (
                                    <span className="text-[10px] text-gray-400 italic">Sem telefone cadastrado</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-5xl mb-2 opacity-20">person_search</span>
                    <p>Nenhum colaborador encontrado.</p>
                </div>
            )}

            {/* Modal Removed */}
        </div>
    );
};

export default Receptionists;