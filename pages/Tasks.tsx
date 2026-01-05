import React, { useState } from 'react';
import { Task, TaskStatus, Priority } from '../../types';

const mockTasks: Task[] = [
    {
        id: '1',
        title: 'Preparar laudo do paciente João',
        description: 'Verificar as imagens de ressonância anexadas no sistema PACS e comparar com o exame anterior de 2022.',
        isPatientRelated: true,
        patient: 'João Silva',
        patientCard: '0032.1123.4432.00',
        patientPhone: '(14) 99887-7766',
        status: TaskStatus.PENDING,
        priority: Priority.HIGH,
        date: '2023-10-27',
        assignedTo: 'Dr. Ricardo'
    },
    {
        id: '2',
        title: 'Reunião de setor',
        description: 'Discutir novas escalas de plantão para o próximo mês.',
        isPatientRelated: false,
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.MEDIUM,
        date: '2023-10-28',
        assignedTo: 'Enf. Carla'
    },
    { id: '3', title: 'Solicitar insumos', status: TaskStatus.DONE, priority: Priority.LOW, date: '2023-10-26', assignedTo: 'Recepção' },
    { id: '4', title: 'Confirmar cirurgias da semana', status: TaskStatus.PENDING, priority: Priority.HIGH, date: '2023-10-29', assignedTo: 'Secretaria' },
];

const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>(mockTasks);
    const [filter, setFilter] = useState<TaskStatus | 'Active'>('Active');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create'>('create');
    const [currentTask, setCurrentTask] = useState<Task | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<Task>>({
        title: '',
        description: '',
        isPatientRelated: false,
        patient: '',
        patientCard: '',
        patientGuide: '',
        patientPhone: '',
        status: TaskStatus.PENDING,
        priority: Priority.MEDIUM,
        date: new Date().toISOString().split('T')[0],
        assignedTo: ''
    });

    // Filter Logic
    const filteredTasks = tasks.filter(task => {
        if (filter === 'Active') {
            return task.status !== TaskStatus.DONE;
        }
        return task.status === filter;
    });

    // Handlers
    const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
        setTasks(prevTasks =>
            prevTasks.map(task =>
                task.id === taskId ? { ...task, status: newStatus } : task
            )
        );
    };

    const handleOpenModal = (mode: 'view' | 'edit' | 'create', task?: Task) => {
        setModalMode(mode);
        if (task) {
            setCurrentTask(task);
            setFormData({ ...task });
        } else {
            setCurrentTask(null);
            // Reset form for create
            setFormData({
                title: '',
                description: '',
                isPatientRelated: false,
                patient: '',
                patientCard: '',
                patientGuide: '',
                patientPhone: '',
                status: TaskStatus.PENDING,
                priority: Priority.MEDIUM,
                date: new Date().toISOString().split('T')[0],
                assignedTo: ''
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setCurrentTask(null), 200); // Wait for animation
    };

    const handleDelete = (taskId: string, e?: React.MouseEvent) => {
        // Robust event handling to prevent modal opening
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (window.confirm("Tem certeza que deseja excluir esta tarefa permanentemente?")) {
            setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));

            // If the deleted task was open in the modal, close it
            if (isModalOpen && currentTask?.id === taskId) {
                closeModal();
            }
        }
    };

    const handleEditClick = (task: Task, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        handleOpenModal('edit', task);
    };

    const handleSave = () => {
        if (!formData.title || !formData.assignedTo) {
            alert("Por favor, preencha o título e o responsável.");
            return;
        }

        const cleanData = { ...formData };
        if (!cleanData.isPatientRelated) {
            cleanData.patient = '';
            cleanData.patientCard = '';
            cleanData.patientGuide = '';
            cleanData.patientPhone = '';
        }

        if (modalMode === 'create') {
            const newTask: Task = {
                id: Date.now().toString(),
                title: cleanData.title || '',
                description: cleanData.description || '',
                isPatientRelated: cleanData.isPatientRelated,
                patient: cleanData.patient,
                patientCard: cleanData.patientCard,
                patientGuide: cleanData.patientGuide,
                patientPhone: cleanData.patientPhone,
                status: cleanData.status as TaskStatus,
                priority: cleanData.priority as Priority,
                date: cleanData.date || new Date().toISOString().split('T')[0],
                assignedTo: cleanData.assignedTo || ''
            };
            setTasks(prev => [newTask, ...prev]);
        } else if (modalMode === 'edit' && currentTask) {
            setTasks(prev => prev.map(t => t.id === currentTask.id ? { ...t, ...cleanData } as Task : t));
        }
        closeModal();
    };

    const getPriorityColor = (p: Priority) => {
        switch (p) {
            case Priority.HIGH: return 'bg-red-100 text-red-700 border-red-200';
            case Priority.MEDIUM: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case Priority.LOW: return 'bg-blue-100 text-blue-700 border-blue-200';
        }
    };

    const getStatusIcon = (s: TaskStatus) => {
        switch (s) {
            case TaskStatus.PENDING: return 'radio_button_unchecked';
            case TaskStatus.IN_PROGRESS: return 'hourglass_empty';
            case TaskStatus.DONE: return 'check_circle';
        }
    }

    const getStatusStyles = (s: TaskStatus) => {
        switch (s) {
            case TaskStatus.DONE: return 'bg-green-100 text-green-600';
            case TaskStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-600';
            default: return 'bg-gray-100 text-gray-500 group-hover:bg-gray-200';
        }
    }

    return (
        <div className="flex flex-col gap-6 relative">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Gerenciamento de Tarefas</h2>
                    <p className="text-gray-500">Acompanhe as atividades do setor.</p>
                </div>
                <button
                    onClick={() => handleOpenModal('create')}
                    className="bg-secondary text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-sm hover:shadow-md"
                >
                    <span className="material-symbols-outlined">add</span>
                    Nova Tarefa
                </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
                {['Active', TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.DONE].map((status) => {
                    let label = status;
                    if (status === 'Active') label = 'Em Aberto';

                    return (
                        <button
                            key={status}
                            onClick={() => setFilter(status as any)}
                            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${filter === status
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                }`}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {filteredTasks.map((task) => (
                    <div
                        key={task.id}
                        onClick={() => handleOpenModal('view', task)}
                        className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 group"
                    >
                        <div className="flex items-start gap-4 flex-1 w-full">
                            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                                <div
                                    className={`p-3 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${getStatusStyles(task.status)}`}
                                    title="Clique para alterar o status"
                                >
                                    <span className="material-symbols-outlined text-2xl pointer-events-none">{getStatusIcon(task.status)}</span>
                                </div>
                                <select
                                    value={task.status}
                                    onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                >
                                    {Object.values(TaskStatus).map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className={`font-bold text-lg transition-all truncate ${task.status === TaskStatus.DONE ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                    {task.title}
                                </h4>
                                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                                    {task.isPatientRelated && task.patient && (
                                        <span className="flex items-center gap-1 bg-primary-light text-primary-dark border border-primary/10 px-2 py-1 rounded-md font-medium">
                                            <span className="material-symbols-outlined text-sm">person</span>{task.patient}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md"><span className="material-symbols-outlined text-sm">badge</span>{task.assignedTo}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-none pt-4 lg:pt-0 mt-2 lg:mt-0">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => handleEditClick(task, e)}
                                    className="p-2 text-gray-400 hover:text-primary hover:bg-primary-light rounded-lg transition-colors z-10 relative"
                                    title="Editar Tarefa"
                                    type="button"
                                >
                                    <span className="material-symbols-outlined pointer-events-none">edit</span>
                                </button>
                                <button
                                    onClick={(e) => handleDelete(task.id, e)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors z-10 relative"
                                    title="Excluir Tarefa"
                                    type="button"
                                >
                                    <span className="material-symbols-outlined pointer-events-none">delete</span>
                                </button>
                            </div>

                            <span className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${getPriorityColor(task.priority)}`}>
                                {task.priority}
                            </span>
                        </div>
                    </div>
                ))}

                {filteredTasks.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                        <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">
                            {filter === TaskStatus.DONE ? 'playlist_add_check' : 'assignment_turned_in'}
                        </span>
                        <p className="text-gray-500 font-medium">
                            {filter === TaskStatus.DONE ? 'Nenhuma tarefa concluída ainda.' : 'Nenhuma tarefa pendente encontrada.'}
                        </p>
                    </div>
                )}
            </div>

            {/* --- WIDE MODAL FOR ALL MODES --- */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    {/* Added max-w-5xl for extra horizontal space */}
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 transition-all">

                        {/* Header */}
                        <div className={`px-8 py-5 flex justify-between items-center shrink-0 ${modalMode === 'view' ? 'bg-gray-100' : 'bg-primary text-white'
                            }`}>
                            <h3 className={`font-bold text-xl ${modalMode === 'view' ? 'text-gray-800' : 'text-white'}`}>
                                {modalMode === 'create' && 'Nova Tarefa'}
                                {modalMode === 'edit' && 'Editar Tarefa'}
                                {modalMode === 'view' && 'Detalhes da Tarefa'}
                            </h3>
                            <button onClick={closeModal} className={`p-1 rounded-full hover:bg-white/20 transition-colors ${modalMode === 'view' ? 'text-gray-500' : 'text-white'}`}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Body - Scrollable with Grid Layout */}
                        <div className="p-8 overflow-y-auto no-scrollbar">
                            {/* VIEW MODE */}
                            {modalMode === 'view' ? (
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                    {/* Left Column: Main Task Info (8 cols) */}
                                    <div className="lg:col-span-8 space-y-6">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Título</label>
                                                    <h2 className="text-gray-900 font-bold text-3xl leading-tight mt-1">{formData.title}</h2>
                                                </div>
                                                <span className={`px-4 py-1.5 rounded-full text-sm font-bold border shrink-0 ${getPriorityColor(formData.priority as Priority)}`}>
                                                    {formData.priority}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <label className="text-xs font-bold text-gray-400 uppercase mb-3 block flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">description</span>
                                                Descrição Detalhada
                                            </label>
                                            <p className="text-gray-700 text-base whitespace-pre-wrap leading-relaxed">
                                                {formData.description || <span className="text-gray-400 italic">Sem descrição.</span>}
                                            </p>
                                        </div>

                                        <div className="flex gap-8 border-t border-gray-100 pt-6">
                                            <div>
                                                <label className="text-xs font-bold text-gray-400 uppercase">Responsável</label>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="size-10 rounded-full bg-secondary text-white flex items-center justify-center font-bold">
                                                        {formData.assignedTo?.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900">{formData.assignedTo}</p>
                                                        <p className="text-xs text-gray-500">Colaborador</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="h-auto w-px bg-gray-200"></div>
                                            <div>
                                                <label className="text-xs font-bold text-gray-400 uppercase">Status Atual</label>
                                                <div className={`mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${getStatusStyles(formData.status as TaskStatus)}`}>
                                                    <span className="material-symbols-outlined text-xl">{getStatusIcon(formData.status as TaskStatus)}</span>
                                                    {formData.status}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Context/Patient (4 cols) */}
                                    <div className="lg:col-span-4 flex flex-col h-full">
                                        {formData.isPatientRelated ? (
                                            // CHANGED: From Blue to Primary Green Theme
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
                                                        <p className="text-gray-900 font-bold text-xl mt-1 leading-tight">{formData.patient || '-'}</p>
                                                    </div>

                                                    {/* CHANGED: Vertical stack instead of Grid to prevent overlap/truncation */}
                                                    <div className="flex flex-col gap-4">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-1">
                                                                Carteirinha
                                                                <span className="material-symbols-outlined text-[10px] text-primary/40">badge</span>
                                                            </label>
                                                            <p className="font-mono text-base font-medium bg-white px-3 py-2 rounded-lg border border-primary/20 text-gray-800 w-full shadow-sm tracking-wide mt-1">
                                                                {formData.patientCard || '-'}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-1">
                                                                Guia Autorizada
                                                                <span className="material-symbols-outlined text-[10px] text-primary/40">fact_check</span>
                                                            </label>
                                                            <p className="text-gray-900 font-bold text-sm mt-1 ml-1">
                                                                {formData.patientGuide || <span className="text-gray-400 font-normal italic">Não informada</span>}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="pt-2 border-t border-primary/10 mt-2">
                                                        <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Contato</label>
                                                        <a href={`tel:${formData.patientPhone}`} className="flex items-center gap-2 text-gray-800 font-bold mt-2 hover:text-primary transition-colors bg-white/60 p-2 rounded-lg">
                                                            <span className="material-symbols-outlined text-lg text-primary">call</span>
                                                            {formData.patientPhone || '-'}
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="h-full border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-300 p-8 text-center bg-gray-50/50">
                                                <span className="material-symbols-outlined text-5xl mb-3">work_outline</span>
                                                <h4 className="font-bold text-gray-400">Tarefa Interna</h4>
                                                <p className="text-sm">Esta tarefa não está vinculada a um paciente específico.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* EDIT / CREATE MODE - Full Horizontal Form */
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                    {/* Left Column: Form Fields (7 cols) */}
                                    <div className="lg:col-span-7 space-y-6">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Título da Tarefa *</label>
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                className="w-full p-4 border border-gray-300 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none text-base font-medium transition-all shadow-sm"
                                                placeholder="O que precisa ser feito?"
                                                autoFocus
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Responsável *</label>
                                                <input
                                                    type="text"
                                                    value={formData.assignedTo}
                                                    onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                                                    className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm bg-gray-50"
                                                    placeholder="Nome ou Setor"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Prioridade</label>
                                                    <select
                                                        value={formData.priority}
                                                        onChange={e => setFormData({ ...formData, priority: e.target.value as Priority })}
                                                        className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm bg-white cursor-pointer"
                                                    >
                                                        {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Status</label>
                                                    <select
                                                        value={formData.status}
                                                        onChange={e => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                                                        className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm bg-white cursor-pointer"
                                                    >
                                                        {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Detalhes</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                className="w-full p-4 border border-gray-300 rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none text-sm resize-none h-40 transition-all shadow-sm"
                                                placeholder="Descreva os passos necessários para concluir esta tarefa..."
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column: Patient Toggle & Data (5 cols) */}
                                    <div className="lg:col-span-5 flex flex-col">
                                        <div className={`rounded-2xl border transition-all duration-300 h-full overflow-hidden flex flex-col ${formData.isPatientRelated
                                                ? 'bg-white border-primary/30 shadow-lg shadow-primary/5'
                                                : 'bg-gray-50 border-gray-200'
                                            }`}>
                                            <div
                                                className="p-5 flex items-center justify-between cursor-pointer border-b border-gray-100"
                                                onClick={() => setFormData({ ...formData, isPatientRelated: !formData.isPatientRelated })}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2.5 rounded-xl transition-colors ${formData.isPatientRelated ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                        <span className="material-symbols-outlined">personal_injury</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-sm font-bold text-gray-900">Vincular Paciente</span>
                                                        <span className="block text-xs text-gray-500">Habilitar dados clínicos</span>
                                                    </div>
                                                </div>
                                                <div className={`w-12 h-7 rounded-full relative transition-colors duration-300 ${formData.isPatientRelated ? 'bg-primary' : 'bg-gray-300'}`}>
                                                    <div className={`absolute top-1 left-1 bg-white size-5 rounded-full transition-transform duration-300 shadow-sm ${formData.isPatientRelated ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                </div>
                                            </div>

                                            <div className={`flex-1 transition-all duration-300 ease-in-out bg-white ${formData.isPatientRelated ? 'opacity-100' : 'opacity-50 grayscale pointer-events-none'}`}>
                                                <div className="p-6 space-y-5">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nome do Paciente</label>
                                                        <input
                                                            type="text"
                                                            value={formData.patient}
                                                            onChange={e => setFormData({ ...formData, patient: e.target.value })}
                                                            className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm"
                                                            placeholder="Nome completo"
                                                            disabled={!formData.isPatientRelated}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Carteirinha</label>
                                                            <input
                                                                type="text"
                                                                value={formData.patientCard}
                                                                onChange={e => setFormData({ ...formData, patientCard: e.target.value })}
                                                                className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm"
                                                                placeholder="000.000.000"
                                                                disabled={!formData.isPatientRelated}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Guia</label>
                                                            <input
                                                                type="text"
                                                                value={formData.patientGuide}
                                                                onChange={e => setFormData({ ...formData, patientGuide: e.target.value })}
                                                                className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm"
                                                                placeholder="Opcional"
                                                                disabled={!formData.isPatientRelated}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Telefone</label>
                                                        <input
                                                            type="text"
                                                            value={formData.patientPhone}
                                                            onChange={e => setFormData({ ...formData, patientPhone: e.target.value })}
                                                            className="w-full p-3 border border-gray-300 rounded-xl focus:border-primary outline-none text-sm"
                                                            placeholder="(XX) XXXXX-XXXX"
                                                            disabled={!formData.isPatientRelated}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Action */}
                        <div className="bg-gray-50 px-8 py-5 flex justify-end gap-3 border-t border-gray-100 shrink-0">
                            {modalMode === 'view' ? (
                                <>
                                    <button
                                        onClick={(e) => currentTask && handleDelete(currentTask.id, e)}
                                        className="mr-auto text-red-500 hover:text-red-700 font-bold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2 hover:bg-red-50"
                                        type="button"
                                    >
                                        <span className="material-symbols-outlined">delete</span>
                                        Excluir Tarefa
                                    </button>
                                    <button
                                        onClick={() => currentTask && handleOpenModal('edit', currentTask)}
                                        className="bg-primary hover:bg-primary-dark text-white font-bold text-sm px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-primary/30"
                                    >
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                        Editar
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={closeModal}
                                        className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="px-8 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors shadow-lg shadow-primary/30 flex items-center gap-2 transform active:scale-95"
                                    >
                                        {modalMode === 'create' ? <span className="material-symbols-outlined text-lg">add_circle</span> : <span className="material-symbols-outlined text-lg">save</span>}
                                        {modalMode === 'create' ? 'Criar Tarefa' : 'Salvar Alterações'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tasks;