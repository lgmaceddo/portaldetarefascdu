import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Simple types for the Dashboard logic
interface Room {
  id: string;
  name: string;
  extension?: string;
}
interface AllocationRecord {
  id: string;
  roomId: string;
  date: string;
  shift: 'morning' | 'afternoon';
  doctorId: string;
}
interface Doctor {
  id: string;
  name: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  useEffect(() => {
    const savedRooms = localStorage.getItem('mediportal_rooms');
    const savedAllocations = localStorage.getItem('mediportal_allocations');
    const savedDocs = localStorage.getItem('mediportal_professionals');

    if (savedRooms) setRooms(JSON.parse(savedRooms));
    else {
       setRooms(Array.from({length: 10}, (_, i) => ({ id: `r${i}`, name: `Sala 0${i+1}` })));
    }

    if (savedAllocations) setAllocations(JSON.parse(savedAllocations));
    if (savedDocs) setDoctors(JSON.parse(savedDocs));
  }, []);

  const todayDateKey = new Date().toISOString().split('T')[0];

  const getDoctorName = (id: string) => {
      const doc = doctors.find(d => d.id === id);
      return doc ? doc.name : 'Médico Alocado';
  };

  const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Bom dia';
      if (hour < 18) return 'Boa tarde';
      return 'Boa noite';
  };

  const getFormattedUserName = () => {
      if (!user) return 'Usuário';
      
      // Se for médico, exibe "Dr. Nome" (os dois primeiros termos para incluir o título)
      if (user.role === 'doctor') {
          const parts = user.name.trim().split(' ');
          if (parts.length > 1) {
              return parts.slice(0, 2).join(' '); // Ex: "Dr. Ricardo"
          }
          return user.name;
      }
      
      // Se for recepção, exibe apenas o primeiro nome
      return user.name.split(' ')[0];
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full">
      
      {/* --- Modern Header Section --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {getGreeting()}, <span className="text-primary">{getFormattedUserName()}</span>.
            </h1>
            <p className="text-gray-500 text-sm mt-1 font-medium">
                Aqui está o resumo operacional de hoje.
            </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
            <span className="material-symbols-outlined text-primary text-xl">calendar_today</span>
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
        </div>
      </div>

      {/* --- Stats / Quick Access Grid --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* WIDGET: Tarefas */}
        <NavLink to="/tarefas" className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-orange-200 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-between h-40">
            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="p-1.5 bg-orange-100 text-orange-600 rounded-lg material-symbols-outlined text-lg">assignment_late</span>
                        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Pendências</span>
                    </div>
                    <h3 className="text-4xl font-bold text-gray-800">4</h3>
                </div>
                <div className="size-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-xl text-gray-400 group-hover:text-white">arrow_forward</span>
                </div>
            </div>
            <div className="z-10">
                <p className="text-xs text-gray-400 font-medium">3 Alta Prioridade</p>
            </div>
            {/* Decoration */}
            <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-orange-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
        </NavLink>

        {/* WIDGET: Recados */}
        <NavLink to="/recados" className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-lg transition-all group relative overflow-hidden flex flex-col justify-between h-40">
            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="p-1.5 bg-blue-100 text-blue-600 rounded-lg material-symbols-outlined text-lg">mark_chat_unread</span>
                        <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Novos Recados</span>
                    </div>
                    <h3 className="text-4xl font-bold text-gray-800">7</h3>
                </div>
                <div className="size-10 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <span className="material-symbols-outlined text-xl text-gray-400 group-hover:text-white">arrow_forward</span>
                </div>
            </div>
            <div className="z-10">
                <p className="text-xs text-gray-400 font-medium">2 da Recepção Central</p>
            </div>
            {/* Decoration */}
            <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
        </NavLink>
      </div>

      {/* --- Main Content Area (Role Based) --- */}
      <div className={`grid grid-cols-1 ${user?.role === 'reception' ? 'lg:grid-cols-1' : 'lg:grid-cols-2'} gap-6`}>
        
        {user?.role === 'reception' ? (
            /* RECEPTION: ROOM OCCUPANCY */
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-xl text-gray-800">Ocupação das Salas</h3>
                        <p className="text-xs text-gray-500 mt-1">Visão rápida da alocação de hoje.</p>
                    </div>
                    <NavLink to="/mapa" className="text-primary hover:bg-primary-light/50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                        Mapa Completo <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </NavLink>
                </div>
                
                {/* Horizontal Scrollable Map */}
                <div className="flex-1 overflow-x-auto custom-scrollbar flex gap-4 pb-4">
                    {rooms.length > 0 ? rooms.map(room => {
                        const am = allocations.find(a => a.roomId === room.id && a.date === todayDateKey && a.shift === 'morning');
                        const pm = allocations.find(a => a.roomId === room.id && a.date === todayDateKey && a.shift === 'afternoon');
                        
                        return (
                            <div key={room.id} className="min-w-[200px] bg-gray-50 border border-gray-100 rounded-xl flex flex-col hover:border-gray-300 transition-colors">
                                <div className="p-3 border-b border-gray-200 bg-white rounded-t-xl flex justify-between items-center">
                                    <span className="font-bold text-xs text-gray-700 uppercase">{room.name}</span>
                                    <span className="size-2 rounded-full bg-green-500"></span>
                                </div>
                                <div className="p-3 flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-gray-400 w-8">MANHÃ</span>
                                        <div className={`flex-1 h-1.5 rounded-full ${am ? 'bg-primary' : 'bg-gray-200'}`}></div>
                                    </div>
                                    <p className="text-xs font-medium text-gray-700 truncate pl-10">
                                        {am ? getDoctorName(am.doctorId).split(' ').slice(0, 2).join(' ') : '-'}
                                    </p>
                                    
                                    <div className="w-full h-px bg-gray-200 my-1"></div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-gray-400 w-8">TARDE</span>
                                        <div className={`flex-1 h-1.5 rounded-full ${pm ? 'bg-primary' : 'bg-gray-200'}`}></div>
                                    </div>
                                    <p className="text-xs font-medium text-gray-700 truncate pl-10">
                                        {pm ? getDoctorName(pm.doctorId).split(' ').slice(0, 2).join(' ') : '-'}
                                    </p>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="w-full py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">meeting_room</span>
                            <p className="text-sm">Nenhuma sala configurada.</p>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            /* DOCTOR: CURRENT STATION CARD (Modernized) */
            <div className="bg-white p-0 rounded-2xl shadow-lg border border-gray-100 overflow-hidden lg:col-span-2 flex flex-col md:flex-row relative group">
                 {/* Visual Left Side */}
                 <div className="bg-primary p-8 md:w-1/3 flex flex-col justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                        <span className="material-symbols-outlined text-9xl">medical_services</span>
                    </div>
                    <div className="relative z-10">
                        <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 border border-white/10">
                            Em Atendimento
                        </span>
                        <h3 className="text-2xl font-bold leading-tight">Sua Alocação Atual</h3>
                        <p className="text-primary-light text-sm mt-2 opacity-90">Confira sua sala e ramal para o turno.</p>
                    </div>
                    <div className="relative z-10 mt-8">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <span className="material-symbols-outlined">schedule</span>
                            <span>{new Date().getHours() < 12 ? 'Turno da Manhã' : 'Turno da Tarde'}</span>
                        </div>
                    </div>
                 </div>

                 {/* Info Right Side */}
                 <div className="p-8 md:w-2/3 flex flex-col justify-center">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Você está alocado na</p>
                            <h2 className="text-4xl font-bold text-gray-800">Sala 03</h2>
                        </div>
                        <div className="bg-green-50 text-green-700 p-3 rounded-xl">
                            <span className="material-symbols-outlined text-3xl">meeting_room</span>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Ramal</p>
                            <p className="text-lg font-bold text-gray-700">203</p>
                        </div>
                        <div className="flex-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">Andar</p>
                            <p className="text-lg font-bold text-gray-700">9º</p>
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end">
                        <NavLink to="/mapa" className="flex items-center gap-2 text-primary font-bold text-sm hover:underline">
                            Ver mapa completo do setor
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </NavLink>
                    </div>
                 </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;