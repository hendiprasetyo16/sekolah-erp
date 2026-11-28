import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ChevronDown,
    Clock,
    Loader2,
    MapPin,
    Save,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    detectScheduleConflicts,
    getDayLabel,
    schedulesService,
    timeToMinutes,
} from '../services/schedules.service';
import type {
    DayOfWeekNumber,
    ScheduleClassOption,
    ScheduleEntryItem,
    ScheduleSubjectOption,
    ScheduleTeacherOption,
    WorkDaysMode,
} from '../types/schedules.types';

interface ScheduleFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => Promise<void> | void;
    schoolId: string;
    academicYearId: string;
    workDaysMode: WorkDaysMode;
    classes: ScheduleClassOption[];
    subjects: ScheduleSubjectOption[];
    teachers: ScheduleTeacherOption[];
    existingEntries: ScheduleEntryItem[];
    editingEntry: ScheduleEntryItem | null;
    defaultClassId?: string;
    defaultDayOfWeek?: DayOfWeekNumber;
    isId?: boolean;
}

const SELECT_FIELD_CLASS =
    'appearance-none w-full h-10 rounded-lg border border-input bg-background text-foreground pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-colors';

export const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    schoolId,
    academicYearId,
    workDaysMode,
    classes,
    subjects,
    teachers,
    existingEntries,
    editingEntry,
    defaultClassId,
    defaultDayOfWeek,
    isId = true,
}) => {
    const allowedDays = useMemo<DayOfWeekNumber[]>(
        () => (workDaysMode === 'FIVE_DAYS' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6]),
        [workDaysMode]
    );

    const [classId, setClassId] = useState<string>('');
    const [subjectId, setSubjectId] = useState<string>('');
    const [teacherId, setTeacherId] = useState<string>('');
    const [dayOfWeek, setDayOfWeek] = useState<DayOfWeekNumber>(1);
    const [startTime, setStartTime] = useState<string>('07:30');
    const [endTime, setEndTime] = useState<string>('09:00');
    const [room, setRoom] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setSubmitError(null);

        if (editingEntry) {
            setClassId(editingEntry.classId);
            setSubjectId(editingEntry.subjectId ?? subjects[0]?.id ?? '');
            setTeacherId(editingEntry.teacherId ?? '');
            setDayOfWeek(editingEntry.dayOfWeek);
            setStartTime(editingEntry.startTime);
            setEndTime(editingEntry.endTime);
            setRoom(editingEntry.room ?? '');
            setNotes(editingEntry.notes ?? '');
        } else {
            setClassId(defaultClassId || classes[0]?.id || '');
            setSubjectId(subjects[0]?.id || '');
            setTeacherId('');
            setDayOfWeek(
                defaultDayOfWeek && allowedDays.includes(defaultDayOfWeek)
                    ? defaultDayOfWeek
                    : 1
            );
            setStartTime('07:30');
            setEndTime('09:00');
            setRoom('');
            setNotes('');
        }
    }, [
        isOpen,
        editingEntry,
        defaultClassId,
        defaultDayOfWeek,
        allowedDays,
        classes,
        subjects,
    ]);

    const timeInvalid = useMemo(
        () => timeToMinutes(endTime) <= timeToMinutes(startTime),
        [startTime, endTime]
    );

    const liveConflicts = useMemo(() => {
        if (!classId || timeInvalid) return [];
        return detectScheduleConflicts(
            {
                id: editingEntry?.id,
                classId,
                teacherId: teacherId || null,
                dayOfWeek,
                startTime,
                endTime,
                room,
            },
            existingEntries,
            isId
        );
    }, [
        editingEntry?.id,
        classId,
        teacherId,
        dayOfWeek,
        startTime,
        endTime,
        room,
        existingEntries,
        timeInvalid,
        isId,
    ]);

    const teacherSessionCount = useMemo(() => {
        if (!teacherId) return 0;
        return existingEntries.filter(
            (e) => e.teacherId === teacherId && e.id !== editingEntry?.id
        ).length;
    }, [teacherId, existingEntries, editingEntry?.id]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (timeInvalid) {
            setSubmitError(
                isId
                    ? 'Jam selesai harus lebih akhir dari jam mulai.'
                    : 'End time must be later than start time.'
            );
            return;
        }

        if (liveConflicts.length > 0) {
            setSubmitError(liveConflicts[0].message);
            return;
        }

        try {
            setIsSubmitting(true);
            await schedulesService.saveEntry({
                id: editingEntry?.id,
                schoolId,
                academicYearId,
                classId,
                subjectId,
                teacherId: teacherId || null,
                dayOfWeek,
                startTime,
                endTime,
                room,
                notes,
            });
            await onSaved();
            onClose();
        } catch (err) {
            setSubmitError(
                err instanceof Error
                    ? err.message
                    : isId
                        ? 'Terjadi kesalahan saat menyimpan jadwal.'
                        : 'An error occurred while saving the schedule.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-modal-title"
        >
            <div className="w-full max-w-lg rounded-2xl border bg-card text-card-foreground shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
                    <div>
                        <h2 id="schedule-modal-title" className="text-lg font-semibold">
                            {editingEntry
                                ? isId
                                    ? 'Edit Sesi Jadwal'
                                    : 'Edit Schedule Session'
                                : isId
                                    ? 'Tambah Sesi Jadwal Baru'
                                    : 'Add New Schedule Session'}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {isId
                                ? 'Validasi otomatis mencegah bentrok kelas, guru, dan ruangan.'
                                : 'Automatic validation prevents class, teacher, and room conflicts.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={isId ? 'Tutup modal' : 'Close modal'}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
                    {submitError && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{submitError}</span>
                        </div>
                    )}

                    {!submitError && liveConflicts.length > 0 && (
                        <div className="space-y-1.5 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
                            <div className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {isId ? 'Terdeteksi Bentrok Jadwal:' : 'Schedule Conflict Detected:'}
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5">
                                {liveConflicts.map((c, i) => (
                                    <li key={i}>{c.message}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label htmlFor="sched-class" className="text-sm font-medium block">
                                {isId ? 'Kelas *' : 'Class *'}
                            </label>
                            <div className="relative">
                                <select
                                    id="sched-class"
                                    value={classId}
                                    onChange={(e) => setClassId(e.target.value)}
                                    required
                                    className={SELECT_FIELD_CLASS}
                                >
                                    <option value="" disabled>
                                        {isId ? 'Pilih Kelas' : 'Select Class'}
                                    </option>
                                    {classes.map((cls) => (
                                        <option key={cls.id} value={cls.id}>
                                            {cls.name} {cls.major ? `(${cls.major})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="sched-day" className="text-sm font-medium block">
                                {isId ? 'Hari *' : 'Day *'}
                            </label>
                            <div className="relative">
                                <select
                                    id="sched-day"
                                    value={dayOfWeek}
                                    onChange={(e) => setDayOfWeek(Number(e.target.value) as DayOfWeekNumber)}
                                    required
                                    className={SELECT_FIELD_CLASS}
                                >
                                    {allowedDays.map((d) => (
                                        <option key={d} value={d}>
                                            {getDayLabel(d, isId)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="sched-subject" className="text-sm font-medium block">
                            {isId ? 'Mata Pelajaran *' : 'Subject *'}
                        </label>
                        <div className="relative">
                            <select
                                id="sched-subject"
                                value={subjectId}
                                onChange={(e) => setSubjectId(e.target.value)}
                                required
                                className={SELECT_FIELD_CLASS}
                            >
                                <option value="" disabled>
                                    {isId ? 'Pilih Mata Pelajaran' : 'Select Subject'}
                                </option>
                                {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.code ? `[${s.code}] ` : ''}
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label htmlFor="sched-teacher" className="text-sm font-medium">
                                {isId ? 'Guru Pengampu' : 'Assigned Teacher'}
                            </label>
                            {teacherId && (
                                <span className="text-[11px] text-muted-foreground">
                                    {isId ? 'Total terjadwal:' : 'Total scheduled:'}{' '}
                                    <strong>
                                        {teacherSessionCount + 1} {isId ? 'sesi/minggu' : 'sessions/week'}
                                    </strong>
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <select
                                id="sched-teacher"
                                value={teacherId}
                                onChange={(e) => setTeacherId(e.target.value)}
                                className={SELECT_FIELD_CLASS}
                            >
                                <option value="">
                                    {isId ? '-- Belum Ditentukan --' : '-- Unassigned --'}
                                </option>
                                {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.fullName} {t.subjects ? `— ${t.subjects}` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="sched-start"
                                className="text-sm font-medium flex items-center gap-1.5"
                            >
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                {isId ? 'Jam Mulai *' : 'Start Time *'}
                            </label>
                            <Input
                                id="sched-start"
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="sched-end"
                                className="text-sm font-medium flex items-center gap-1.5"
                            >
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                {isId ? 'Jam Selesai *' : 'End Time *'}
                            </label>
                            <Input
                                id="sched-end"
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {timeInvalid && (
                        <p className="text-xs text-destructive">
                            {isId
                                ? 'Jam selesai harus lebih besar dari jam mulai.'
                                : 'End time must be greater than start time.'}
                        </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="sched-room"
                                className="text-sm font-medium flex items-center gap-1.5"
                            >
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                                {isId ? 'Ruangan / Lab' : 'Room / Lab'}
                            </label>
                            <Input
                                id="sched-room"
                                placeholder={isId ? 'Contoh: Ruang 01, Lab Komputer' : 'e.g. Room 01, Computer Lab'}
                                value={room}
                                onChange={(e) => setRoom(e.target.value)}
                                maxLength={80}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="sched-notes" className="text-sm font-medium block">
                                {isId ? 'Catatan (Opsional)' : 'Notes (Optional)'}
                            </label>
                            <Input
                                id="sched-notes"
                                placeholder={isId ? 'Misal: Praktikum / Blok 2 JP' : 'e.g. Lab session / 2 periods'}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                maxLength={150}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                            {isId ? 'Batal' : 'Cancel'}
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                isSubmitting ||
                                timeInvalid ||
                                liveConflicts.length > 0 ||
                                classes.length === 0 ||
                                subjects.length === 0
                            }
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            {editingEntry
                                ? isId
                                    ? 'Simpan Perubahan'
                                    : 'Save Changes'
                                : isId
                                    ? 'Simpan Jadwal'
                                    : 'Save Schedule'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};