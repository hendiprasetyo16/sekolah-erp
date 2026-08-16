import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Eye, Edit, Trash2,
  Loader2, AlertCircle, CheckCircle2, XCircle, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare // <-- Tambahan icon
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { studentService } from '../services/student.service';
import { supabase } from '@/services/supabase.client';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/modules/auth/store/auth.store';

export function StudentListPage() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { school } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpPage, setJumpPage] = useState<string>('1'); // State untuk input lompat halaman
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // States for Modals & Actions
  const [studentToDelete, setStudentToDelete] = useState<{ id: string, name: string } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false); // State untuk konfirmasi hapus massal
  const [isExporting, setIsExporting] = useState(false);

  // WIZARD IMPORT STATES
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wizardState, setWizardState] = useState<'idle' | 'parsing' | 'preview' | 'importing'>('idle');
  const [parsedImportData, setParsedImportData] = useState<any[]>([]);
  const [importStats, setImportStats] = useState({ total: 0, valid: 0, missingClass: 0, missingMandatory: 0, duplicates: 0 });
  const [unmatchedClasses, setUnmatchedClasses] = useState<string[]>([]);

  const pageSize = 10;

  // Sync jumpPage input dengan currentPage
  useEffect(() => {
    setJumpPage(String(currentPage));
  }, [currentPage]);

  // Fetch Classes
  const { data: classesData } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, gradeLevel')
        .order('gradeLevel', { ascending: true });
      if (error) throw error;
      return data as { id: string; name: string; gradeLevel: number }[];
    }
  });

  // Fetch Students
  const { data: studentsResponse, isLoading } = useQuery({
    queryKey: ['students', currentPage, pageSize, searchQuery, selectedClass],
    queryFn: () => studentService.list({
      page: currentPage,
      limit: pageSize,
      search: searchQuery,
      classId: selectedClass === 'all' ? undefined : selectedClass
    }),
  });

  // Delete Mutation (Satu per satu)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentService.delete(id),
    onSuccess: () => {
      toast.success(locale === 'id' ? 'Siswa berhasil dihapus' : 'Student deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setSelectedRows(prev => prev.filter(r => r !== studentToDelete?.id));
      setStudentToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setStudentToDelete(null);
    }
  });

  // Bulk Delete Mutation (Hapus Massal)
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // Menghapus data secara massal menggunakan perulangan Promise.all
      // Jika di backend Anda punya fungsi khusus bulkDelete, bisa diganti ke sana.
      await Promise.all(ids.map(id => studentService.delete(id)));
    },
    onSuccess: () => {
      toast.success(locale === 'id' ? `${selectedRows.length} data berhasil dihapus` : 'Data deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setSelectedRows([]);
      setIsBulkDeleting(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Gagal menghapus data massal');
      setIsBulkDeleting(false);
    }
  });

  // Bulk Import Mutation
  const importMutation = useMutation({
    mutationFn: (payload: any[]) => studentService.bulkImport(payload),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['students'] });
      closeImportWizard();
    },
    onError: (error: Error) => {
      toast.error(error.message || (locale === 'id' ? 'Gagal melakukan import' : 'Import failed'));
      setWizardState('preview');
    }
  });

  const students = studentsResponse?.data?.data || [];
  const meta = studentsResponse?.data?.meta;
  const totalPages = Math.ceil((meta?.total || 0) / pageSize) || 1;

  const toggleRow = (id: string) => setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  const toggleAll = () => setSelectedRows(selectedRows.length === students.length && students.length > 0 ? [] : students.map(s => s.id));

  // --- LOGIKA IMPORT WIZARD (MEMBACA & MENCEGAH DUPLIKAT) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setWizardState('parsing');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rawData.length === 0) throw new Error('File kosong');

        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
          const rowText = rawData[i]?.map(cell => String(cell).toLowerCase().replace(/\s+/g, '')) || [];
          if (rowText.includes('nama') && (rowText.includes('nipd') || rowText.includes('nisn'))) {
            headerRowIndex = i; break;
          }
        }

        if (headerRowIndex === -1) throw new Error('Format kolom tidak dikenali (Tidak ada Nama/NIPD)');

        const rowMain = rawData[headerRowIndex] as string[] || [];
        const rowSub = rawData[headerRowIndex + 1] as string[] || [];

        let currentGroup = '';
        const cleanHeaders: string[] = [];

        for (let c = 0; c < Math.max(rowMain.length, rowSub.length); c++) {
          const vMain = String(rowMain[c] || '').trim().replace(/[\r\n]+/g, ' ');
          const vSub = String(rowSub[c] || '').trim().replace(/[\r\n]+/g, ' ');

          if (vMain) currentGroup = vMain;
          const groupLower = currentGroup.toLowerCase();

          if (groupLower.includes('data ayah') || groupLower.includes('data ibu') || groupLower.includes('data wali')) {
            cleanHeaders.push(`${currentGroup} ${vSub}`.toLowerCase().trim());
          } else {
            cleanHeaders.push((vMain || vSub).toLowerCase().trim());
          }
        }

        const data = rawData.slice(headerRowIndex + 2).map(rowArray => {
          const rowObject: Record<string, any> = {};
          cleanHeaders.forEach((header, index) => {
            if (header) rowObject[header] = rowArray[index];
          });
          return rowObject;
        });

        const normalizeClassName = (name: string) => {
          if (!name) return '';
          return String(name).toLowerCase().replace(/kelas/g, '').replace(/rombel/g, '')
            .replace(/saat ini/g, '').replace(/tingkat/g, '').replace(/-/g, '').replace(/\s+/g, '').trim();
        };

        const parsedPayloads: any[] = [];
        let missingClassCount = 0;
        let missingMandatoryCount = 0;
        const unfoundClassSet = new Set<string>();

        // Mengambil semua NISN yang sudah ada di database untuk mencegah duplicate error
        const { data: existingStudents } = await supabase
          .from('students')
          .select('nisn')
          .eq('schoolId', school?.id || '');
        const existingNisns = new Set(existingStudents?.map(s => s.nisn) || []);

        let duplicateCount = 0;

        for (const row of data) {
          if (!row['nama'] && !row['nipd'] && !row['nisn']) continue;

          if (!row['nama'] || (!row['nipd'] && !row['nisn'])) {
            missingMandatoryCount++;
            continue;
          }

          const currentNisn = String(row['nisn'] || '').trim();

          // CEK DUPLIKAT: Jika NISN sudah ada, kita hitung sebagai duplikat dan lewati.
          if (currentNisn && existingNisns.has(currentNisn)) {
            duplicateCount++;
            continue; // Skip data ini
          }

          const rombelKey = Object.keys(row).find(k => k.includes('rombel') || k.includes('kelas'));
          const rawExcelRombel = rombelKey ? String(row[rombelKey]) : '';
          const normalizedExcelRombel = normalizeClassName(rawExcelRombel);

          let matchedClass = null;

          if (classesData && classesData.length > 0) {
            matchedClass = classesData.find(c => {
              const normalizedDbClass = normalizeClassName(c.name);
              const dbGradeLevel = String(c.gradeLevel);
              return normalizedDbClass === normalizedExcelRombel || dbGradeLevel === normalizedExcelRombel;
            });
          }

          if (!matchedClass) {
            missingClassCount++;
            unfoundClassSet.add(rawExcelRombel || '(Kolom Kelas Kosong)');
          }

          const toBool = (val: any) => String(val).toLowerCase().trim() === 'ya';

          parsedPayloads.push({
            id: crypto.randomUUID(),
            schoolId: school?.id || '',
            nis: String(row['nipd'] || row['nis'] || ''),
            nisn: currentNisn,
            nik: String(row['nik'] || ''),
            noKk: String(row['no kk'] || row['nokk'] || '-'),
            fullName: String(row['nama'] || ''),
            gender: (String(row['jk'] || row['jenis kelamin'] || '').toUpperCase().startsWith('L') ? 'L' : 'P'),
            birthPlace: String(row['tempat lahir'] || '-'),
            birthDate: !isNaN(Number(row['tanggal lahir']))
              ? new Date(Math.round((Number(row['tanggal lahir']) - 25569) * 86400 * 1000)).toISOString()
              : String(row['tanggal lahir'] || new Date().toISOString()),
            religion: String(row['agama'] || 'ISLAM').toUpperCase(),
            address: String(row['alamat'] || row['dusun'] || '-'),
            city: String(row['kabupaten/kota'] || row['kota'] || ''),
            province: String(row['provinsi'] || ''),
            classId: matchedClass?.id || null,
            entryDate: new Date().toISOString(),
            status: 'AKTIF',

            parents: [
              ...(row['data ayah nama'] || row['nama ayah'] ? [{
                id: crypto.randomUUID(),
                relation: 'AYAH',
                fullName: String(row['data ayah nama'] || row['nama ayah']),
                isAlive: true,
                schoolId: school?.id || ''
              }] : []),
              ...(row['data ibu nama'] || row['nama ibu'] ? [{
                id: crypto.randomUUID(),
                relation: 'IBU',
                fullName: String(row['data ibu nama'] || row['nama ibu']),
                isAlive: true,
                schoolId: school?.id || ''
              }] : [])
            ],

            economic: {
              id: crypto.randomUUID(),
              schoolId: school?.id || '',
              hasKip: toBool(row['penerima kip']),
              kipNumber: String(row['nomor kip'] || ''),
              namaKip: String(row['nama di kip'] || ''),
              layakPip: toBool(row['layak pip (usulan dari sekolah)'] || row['layak pip']),
              alasanLayakPip: String(row['alasan layak pip'] || ''),
            }
          });
        }

        setParsedImportData(parsedPayloads);
        setUnmatchedClasses(Array.from(unfoundClassSet));
        setImportStats({
          total: data.filter(r => r['nama'] || r['nisn'] || r['nipd']).length,
          valid: parsedPayloads.length,
          missingClass: missingClassCount,
          missingMandatory: missingMandatoryCount,
          duplicates: duplicateCount // <-- Menyimpan total data ganda
        });
        setWizardState('preview');

      } catch (error: any) {
        toast.error(error.message || 'Gagal membaca file Excel');
        setWizardState('idle');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const executeImport = () => {
    const finalPayload = parsedImportData.filter(d => d.classId !== null);
    if (finalPayload.length === 0) {
      toast.error('Tidak ada data baru yang valid untuk di-import.');
      return;
    }
    setWizardState('importing');
    importMutation.mutate(finalPayload);
  };

  const closeImportWizard = () => {
    setWizardState('idle');
    setParsedImportData([]);
    setUnmatchedClasses([]);
  };

  const triggerImport = () => fileInputRef.current?.click();

  // --- LOGIKA EXPORT ---
  const handleExport = async () => {
    try {
      setIsExporting(true);
      toast.info(locale === 'id' ? 'Menyiapkan data...' : 'Preparing data...');
      const response = await studentService.list({ page: 1, limit: 10000, search: searchQuery, classId: selectedClass === 'all' ? undefined : selectedClass });
      const allData = response.data?.data || [];
      if (allData.length === 0) return toast.warning('Tidak ada data untuk diexport');

      const excelData = allData.map((s, index) => ({
        'No': index + 1, 'NISN': s.nisn, 'NIK': s.nik, 'Nama Lengkap': s.fullName,
        'Jenis Kelamin': s.gender === 'L' ? 'Laki-laki' : 'Perempuan',
        'Kelas': s.className, 'Tempat Lahir': s.birthPlace,
        'Tanggal Lahir': s.birthDate ? new Date(s.birthDate).toLocaleDateString('id-ID') : '',
        'Alamat': s.address, 'Status': s.status
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data_Siswa");
      worksheet['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 40 }, { wch: 15 }];
      XLSX.writeFile(workbook, `Data_Siswa_${new Date().getTime()}.xlsx`);
      toast.success('Export berhasil!');
    } catch (error) {
      toast.error('Gagal melakukan export data');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusConfig = (status: string) => {
    const config: Record<string, { id: string; en: string; color: string }> = {
      AKTIF: { id: 'Aktif', en: 'Active', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
      MUTASI_KELUAR: { id: 'Mutasi', en: 'Transferred', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
      LULUS: { id: 'Lulus', en: 'Graduated', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
      DO: { id: 'DO', en: 'Dropped Out', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
      CUTI: { id: 'Cuti', en: 'On Leave', color: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
    };
    return config[status] || { id: status, en: status, color: 'bg-muted text-muted-foreground border-border' };
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls, .csv" className="hidden" />

      {/* --- IMPORT WIZARD MODAL --- */}
      <AnimatePresence>
        {wizardState !== 'idle' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

              <div className="p-6 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg"><FileSpreadsheet size={24} /></div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Import Wizard Dapodik</h3>
                    <p className="text-sm text-muted-foreground">Validasi dan pencocokan data otomatis</p>
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 bg-card overflow-y-auto">
                {wizardState === 'parsing' && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                    <p className="font-medium text-foreground">Menganalisa dan Mencari Data Ganda...</p>
                    <p className="text-sm text-muted-foreground">Ini membutuhkan waktu beberapa detik.</p>
                  </div>
                )}

                {wizardState === 'importing' && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
                    <p className="font-medium text-foreground">Sedang menyimpan data ke Database...</p>
                    <p className="text-sm text-muted-foreground">Tolong jangan tutup halaman ini.</p>
                  </div>
                )}

                {wizardState === 'preview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/30 border border-border p-4 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-black text-foreground">{importStats.total}</span>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Total Excel</span>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-black text-emerald-600">{importStats.valid - importStats.missingClass}</span>
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mt-1">Data Baru</span>
                      </div>
                    </div>

                    <div className="space-y-3 mt-6">
                      <h4 className="text-sm font-semibold text-foreground">Hasil Validasi:</h4>

                      {/* INFO DUPLIKAT BARU */}
                      {importStats.duplicates > 0 && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400">
                          <CheckSquare className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold">Data Sudah Ada ({importStats.duplicates} Siswa)</p>
                            <p className="text-xs mt-1">Siswa ini sudah ada di dalam database (NISN sama). Sistem akan otomatis melewati data ini agar tidak terjadi error.</p>
                          </div>
                        </div>
                      )}

                      {importStats.missingMandatory > 0 && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400">
                          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold">Data Tidak Lengkap ({importStats.missingMandatory} Siswa)</p>
                            <p className="text-xs mt-1">Siswa ini tidak memiliki Nama atau NISN/NIPD sehingga akan dilewati.</p>
                          </div>
                        </div>
                      )}

                      {importStats.missingClass > 0 && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div className="w-full">
                            <p className="text-sm font-semibold">Kelas Tidak Ditemukan ({importStats.missingClass} Siswa)</p>
                            <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                              {unmatchedClasses.map((className, idx) => (
                                <span key={idx} className="bg-amber-500/20 px-2 py-1 rounded text-xs font-bold font-mono">
                                  {className}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs italic">*Solusi: Buat kelas dengan nama di atas pada menu Kelas, lalu ulangi Import.</p>
                          </div>
                        </div>
                      )}

                      {(importStats.missingMandatory === 0 && importStats.missingClass === 0 && importStats.duplicates === 0) && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                          <p className="text-sm font-medium">Semua data siap dimasukkan dengan sempurna!</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {wizardState === 'preview' && (
                <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-3">
                  <Button variant="outline" onClick={closeImportWizard} disabled={importMutation.isPending}>Batal</Button>
                  <Button
                    onClick={executeImport}
                    disabled={importMutation.isPending || (importStats.valid - importStats.missingClass) === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Mulai Import ({importStats.valid - importStats.missingClass} Data Baru)
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- MODAL KONFIRMASI HAPUS SATUAN & MASSAL --- */}
      <AnimatePresence>
        {(studentToDelete || isBulkDeleting) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="bg-background rounded-2xl shadow-2xl border border-border max-w-md w-full overflow-hidden">
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                <h3 className="text-xl font-bold text-foreground mb-2">Hapus Data Siswa?</h3>
                <p className="text-muted-foreground text-sm">
                  {isBulkDeleting
                    ? `Apakah Anda yakin ingin menghapus ${selectedRows.length} siswa yang dipilih? Tindakan ini tidak dapat dibatalkan.`
                    : `Apakah Anda yakin ingin menghapus siswa bernama "${studentToDelete?.name}"?`}
                </p>
              </div>
              <div className="bg-muted/50 p-4 flex justify-end gap-3 border-t border-border/50">
                <Button variant="outline" onClick={() => { setStudentToDelete(null); setIsBulkDeleting(false); }} disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}>Batal</Button>
                <Button variant="destructive" onClick={() => isBulkDeleting ? bulkDeleteMutation.mutate(selectedRows) : deleteMutation.mutate(studentToDelete!.id)} disabled={deleteMutation.isPending || bulkDeleteMutation.isPending}>
                  {(deleteMutation.isPending || bulkDeleteMutation.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Ya, Hapus
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header & Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('students.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{locale === 'id' ? `Total ${meta?.total || 0} siswa terdaftar` : `${meta?.total || 0} students registered`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* TOMBOL HAPUS MASSAL - Hanya muncul jika ada checkbox yang dicentang */}
          {selectedRows.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              onClick={() => setIsBulkDeleting(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 text-sm font-bold hover:bg-red-500/20 transition-colors shadow-sm"
            >
              <Trash2 size={16} /> <span className="hidden sm:inline">Hapus ({selectedRows.length})</span>
            </motion.button>
          )}

          <button onClick={triggerImport} disabled={wizardState !== 'idle'} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm disabled:opacity-50">
            <Upload size={16} /> <span className="hidden sm:inline">Import Verval PD</span>
          </button>
          <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border/50 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-sm disabled:opacity-50">
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} <span className="hidden sm:inline">Export Data</span>
          </button>
          <Link to="/students/new" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-all shadow-md">
            <Plus size={16} /> <span>Tambah Siswa</span>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border/50 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder={t('students.search')} value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-4 py-2 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 sm:pb-0">
            <button onClick={() => { setSelectedClass('all'); setCurrentPage(1); }} className={cn('px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border', selectedClass === 'all' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600' : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/50')}>Semua Kelas</button>
            {classesData?.map(cls => (
              <button key={cls.id} onClick={() => { setSelectedClass(cls.id); setCurrentPage(1); }} className={cn('px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border', selectedClass === cls.id ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600' : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/50')}>{cls.name}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="p-4 w-12"><input type="checkbox" checked={selectedRows.length === students.length && students.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-border accent-emerald-600" /></th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">No</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">NISN / NIPD</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Siswa</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kelas</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" /><p className="text-muted-foreground">Memuat...</p></td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">Tidak ada data.</td></tr>
              ) : (
                students.map((student, idx) => {
                  const statusConf = getStatusConfig(student.status);
                  return (
                    <motion.tr key={student.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className={cn("hover:bg-muted/30 transition-colors", selectedRows.includes(student.id) && "bg-emerald-500/5")}>
                      <td className="p-4"><input type="checkbox" checked={selectedRows.includes(student.id)} onChange={() => toggleRow(student.id)} className="w-4 h-4 rounded border-border accent-emerald-600" /></td>
                      <td className="px-4 py-3 text-sm font-medium text-muted-foreground">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-4 py-3"><div className="flex flex-col"><span className="text-sm font-bold text-foreground">{student.nisn}</span><span className="text-xs font-mono text-muted-foreground">{student.nis}</span></div></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">{student.fullName.charAt(0)}</div><div><p className="text-sm font-medium">{student.fullName}</p><p className="text-xs text-muted-foreground">{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p></div></div></td>
                      <td className="px-4 py-3"><span className="text-sm">{student.className}</span></td>
                      <td className="px-4 py-3"><span className={cn('text-xs font-medium px-2.5 py-1 rounded-md border', statusConf.color)}>{statusConf.id}</span></td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Link to={`/students/${student.id}`} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"><Eye className="h-4 w-4" /></Link>
                          <Link to={`/students/${student.id}/edit`} className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"><Edit className="h-4 w-4" /></Link>
                          <button onClick={() => setStudentToDelete({ id: student.id, name: student.fullName })} className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* --- PAGINATION TINGKAT LANJUT --- */}
        {(meta?.total || 0) > 0 && (
          <div className="p-4 border-t border-border/50 bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, meta?.total || 0)} dari {meta?.total || 0} siswa
            </span>

            <div className="flex items-center gap-2">

              {/* Kolom Lompat Halaman */}
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2 border-r border-border pr-4">
                <span>Lompat ke:</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = Number(jumpPage);
                      if (p >= 1 && p <= totalPages) setCurrentPage(p);
                    }
                  }}
                  onBlur={() => {
                    const p = Number(jumpPage);
                    if (p >= 1 && p <= totalPages) setCurrentPage(p);
                    else setJumpPage(String(currentPage));
                  }}
                  className="w-14 h-8 text-center bg-background border border-border rounded-md focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Tombol Halaman Awal */}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                <ChevronsLeft size={16} />
              </Button>
              {/* Tombol Mundur */}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}>
                <ChevronLeft size={16} />
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  if (page === 1 || page === totalPages || Math.abs(currentPage - page) <= 1) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          "w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-colors border",
                          currentPage === page ? "bg-emerald-600 text-white border-emerald-600" : "bg-background border-border/50 hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {page}
                      </button>
                    );
                  }
                  if (Math.abs(currentPage - page) === 2) {
                    return <span key={`ellipsis-${page}`} className="text-muted-foreground px-1">...</span>;
                  }
                  return null;
                })}
              </div>

              {/* Tombol Maju */}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}>
                <ChevronRight size={16} />
              </Button>
              {/* Tombol Halaman Akhir */}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                <ChevronsRight size={16} />
              </Button>

            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}