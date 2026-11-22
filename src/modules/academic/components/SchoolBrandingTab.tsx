// src/modules/academic/components/SchoolBrandingTab.tsx
import { useState, useEffect, useRef } from 'react';
import {
    Image as ImageIcon,
    Upload,
    Trash2,
    Save,
    Loader2,
    PenTool,
    Stamp,
    CheckCircle2,
    AlertCircle,
    Info,
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Parameter yang dapat disesuaikan
const STORAGE_BUCKET = 'school-assets';
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // Maksimal 2 MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

type UploadTarget = 'logo' | 'signature' | 'stamp';

interface SchoolBrandingRow {
    id: string;
    name: string;
    logoUrl: string | null;
    principalName: string | null;
    principalNip: string | null;
    principalSignatureUrl: string | null;
    schoolStampUrl: string | null;
}

export function SchoolBrandingTab() {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { school, setSchool } = useAuthStore();
    const schoolId = school?.id;

    const logoInputRef = useRef<HTMLInputElement | null>(null);
    const sigInputRef = useRef<HTMLInputElement | null>(null);
    const stampInputRef = useRef<HTMLInputElement | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [uploadingType, setUploadingType] = useState<UploadTarget | null>(null);

    const [logoUrl, setLogoUrl] = useState<string>('');
    const [principalName, setPrincipalName] = useState<string>('');
    const [principalNip, setPrincipalNip] = useState<string>('');
    const [principalSignatureUrl, setPrincipalSignatureUrl] = useState<string>('');
    const [schoolStampUrl, setSchoolStampUrl] = useState<string>('');

    useEffect(() => {
        if (!schoolId) return;
        let mounted = true;

        async function fetchBranding() {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('schools')
                    .select(
                        'id, name, logoUrl, principalName, principalNip, principalSignatureUrl, schoolStampUrl'
                    )
                    .eq('id', schoolId)
                    .maybeSingle();

                if (error) throw error;
                if (!mounted || !data) return;

                const row = data as SchoolBrandingRow;
                setLogoUrl(row.logoUrl ?? '');
                setPrincipalName(row.principalName ?? '');
                setPrincipalNip(row.principalNip ?? '');
                setPrincipalSignatureUrl(row.principalSignatureUrl ?? '');
                setSchoolStampUrl(row.schoolStampUrl ?? '');
            } catch (err: unknown) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : 'Gagal memuat pengaturan logo, TTD, dan stempel.';
                toast.error(msg);
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        void fetchBranding();
        return () => {
            mounted = false;
        };
    }, [schoolId]);

    const handleUploadImage = async (file: File, target: UploadTarget) => {
        if (!schoolId) return;

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            toast.error(
                isId
                    ? 'Format file tidak didukung. Gunakan PNG, JPG, WEBP, atau SVG.'
                    : 'Unsupported file format. Use PNG, JPG, WEBP, or SVG.'
            );
            return;
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            toast.error(
                isId ? 'Ukuran gambar maksimal 2 MB.' : 'Maximum image size is 2 MB.'
            );
            return;
        }

        setUploadingType(target);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const filePath = `${schoolId}/${target}-${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true,
                    contentType: file.type,
                });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(filePath);

            const uploadedUrl = publicUrlData.publicUrl;

            if (target === 'logo') {
                setLogoUrl(uploadedUrl);
            } else if (target === 'signature') {
                setPrincipalSignatureUrl(uploadedUrl);
            } else {
                setSchoolStampUrl(uploadedUrl);
            }

            const labelMap: Record<UploadTarget, string> = {
                logo: isId ? 'Logo sekolah' : 'School logo',
                signature: isId ? 'TTD Kepala Sekolah' : 'Principal signature',
                stamp: isId ? 'Stempel sekolah' : 'School stamp',
            };

            toast.success(
                isId
                    ? `${labelMap[target]} berhasil diunggah. Klik "Simpan Perubahan" untuk menerapkan.`
                    : `${labelMap[target]} uploaded. Click "Save Changes" to apply.`
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Gagal mengunggah gambar ke server.';
            toast.error(msg);
        } finally {
            setUploadingType(null);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolId) return;

        setIsSaving(true);
        try {
            const payload = {
                logoUrl: logoUrl.trim() || null,
                principalName: principalName.trim() || null,
                principalNip: principalNip.trim() || null,
                principalSignatureUrl: principalSignatureUrl.trim() || null,
                schoolStampUrl: schoolStampUrl.trim() || null,
            };

            const { data, error } = await supabase
                .from('schools')
                .update(payload)
                .eq('id', schoolId)
                .select('*')
                .single();

            if (error) throw error;

            // Sinkronkan store global agar Logo, TTD & Stempel langsung aktif di seluruh modul
            if (data && school) {
                setSchool({
                    ...school,
                    ...data,
                });
            }

            toast.success(
                isId
                    ? 'Logo sekolah, TTD Kepala Sekolah, dan Stempel berhasil disimpan.'
                    : 'School logo, principal signature, and stamp saved successfully.'
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.';
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    if (!schoolId) {
        return (
            <Card className="border-amber-300/60 bg-amber-50/50">
                <CardContent className="flex items-center gap-3 p-6 text-amber-900">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p className="text-sm">
                        {isId
                            ? 'Silakan lengkapi Profil Sekolah terlebih dahulu sebelum mengatur Logo, TTD, dan Stempel.'
                            : 'Please complete the School Profile first before configuring Logo, Signature, and Stamp.'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                <span>
                    {isId ? 'Memuat pengaturan identitas visual...' : 'Loading branding settings...'}
                </span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* KARTU 1: LOGO SEKOLAH */}
                <Card className="border-border bg-card shadow-sm">
                    <CardContent className="flex h-full flex-col justify-between space-y-4 p-5">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                                        <ImageIcon className="h-4 w-4 text-emerald-600" />
                                        {isId ? '1. Logo Resmi Sekolah' : '1. Official School Logo'}
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {isId
                                            ? 'Tampil pada Pemilihan Sekolah (Tenant), Sidebar, Kartu Pelajar, dan Kop Raport.'
                                            : 'Displayed on Tenant Selector, Sidebar, ID Cards, and Report Headers.'}
                                    </p>
                                </div>
                                {logoUrl && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {isId ? 'Aktif' : 'Active'}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-5">
                                {logoUrl ? (
                                    <img
                                        src={logoUrl}
                                        alt="Logo Sekolah"
                                        className="h-24 w-24 rounded-xl border border-border bg-white object-contain p-2 shadow-xs"
                                    />
                                ) : (
                                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                                        <ImageIcon className="h-7 w-7 opacity-40" />
                                        <span className="mt-1 text-[10px]">
                                            {isId ? 'Belum ada logo' : 'No logo'}
                                        </span>
                                    </div>
                                )}

                                <input
                                    ref={logoInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleUploadImage(file, 'logo');
                                        e.target.value = '';
                                    }}
                                />

                                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={uploadingType === 'logo'}
                                        onClick={() => logoInputRef.current?.click()}
                                    >
                                        {uploadingType === 'logo' ? (
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {isId ? 'Unggah Logo' : 'Upload Logo'}
                                    </Button>

                                    {logoUrl && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                            onClick={() => setLogoUrl('')}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                                {isId ? 'Atau Tempel URL Logo' : 'Or Paste Logo URL'}
                            </label>
                            <input
                                type="url"
                                value={logoUrl}
                                onChange={(e) => setLogoUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* KARTU 2: DATA & TTD KEPALA SEKOLAH */}
                <Card className="border-border bg-card shadow-sm">
                    <CardContent className="flex h-full flex-col justify-between space-y-4 p-5">
                        <div className="space-y-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                                        <PenTool className="h-4 w-4 text-emerald-600" />
                                        {isId ? '2. TTD Kepala Sekolah' : '2. Principal Signature'}
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {isId
                                            ? 'Gambar tanda tangan murni (tanpa stempel) untuk pengesahan dokumen.'
                                            : 'Pure signature image (without stamp) for official validation.'}
                                    </p>
                                </div>
                                {principalSignatureUrl && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {isId ? 'Aktif' : 'Active'}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-2.5">
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold text-foreground">
                                        {isId ? 'Nama Kepala Sekolah & Gelar' : 'Principal Name'}
                                    </label>
                                    <input
                                        type="text"
                                        value={principalName}
                                        onChange={(e) => setPrincipalName(e.target.value)}
                                        placeholder="Drs. H. Ahmad Fauzi, M.Pd."
                                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-semibold text-foreground">
                                        {isId ? 'NIP / NBM Kepala Sekolah' : 'Principal NIP / ID'}
                                    </label>
                                    <input
                                        type="text"
                                        value={principalNip}
                                        onChange={(e) => setPrincipalNip(e.target.value)}
                                        placeholder="19750412 200003 1 004"
                                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-4">
                                {principalSignatureUrl ? (
                                    <div className="flex h-20 w-full max-w-44 items-center justify-center rounded-lg border border-border bg-white p-2 shadow-xs">
                                        <img
                                            src={principalSignatureUrl}
                                            alt="TTD Kepala Sekolah"
                                            className="max-h-16 max-w-full object-contain"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-20 w-full max-w-44 flex-col items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                                        <PenTool className="h-5 w-5 opacity-40" />
                                        <span className="mt-1 text-[10px]">
                                            {isId ? 'Belum ada TTD' : 'No signature'}
                                        </span>
                                    </div>
                                )}

                                <input
                                    ref={sigInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleUploadImage(file, 'signature');
                                        e.target.value = '';
                                    }}
                                />

                                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={uploadingType === 'signature'}
                                        onClick={() => sigInputRef.current?.click()}
                                    >
                                        {uploadingType === 'signature' ? (
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {isId ? 'Unggah TTD' : 'Upload Signature'}
                                    </Button>

                                    {principalSignatureUrl && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                            onClick={() => setPrincipalSignatureUrl('')}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* KARTU 3: STEMPEL RESMI SEKOLAH (TERPISAH) */}
                <Card className="border-border bg-card shadow-sm">
                    <CardContent className="flex h-full flex-col justify-between space-y-4 p-5">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                                        <Stamp className="h-4 w-4 text-emerald-600" />
                                        {isId ? '3. Stempel Resmi Sekolah' : '3. Official School Stamp'}
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {isId
                                            ? 'Unggah gambar stempel terpisah (PNG transparan) untuk Kartu Pelajar & Raport.'
                                            : 'Upload separate stamp image (transparent PNG) for ID Cards & Reports.'}
                                    </p>
                                </div>
                                {schoolStampUrl && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle2 className="h-3 w-3" />
                                        {isId ? 'Aktif' : 'Active'}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-5">
                                {schoolStampUrl ? (
                                    <img
                                        src={schoolStampUrl}
                                        alt="Stempel Sekolah"
                                        className="h-24 w-24 rounded-xl border border-border bg-white object-contain p-2 shadow-xs"
                                    />
                                ) : (
                                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                                        <Stamp className="h-7 w-7 opacity-40" />
                                        <span className="mt-1 text-[10px]">
                                            {isId ? 'Belum ada stempel' : 'No stamp'}
                                        </span>
                                    </div>
                                )}

                                <input
                                    ref={stampInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleUploadImage(file, 'stamp');
                                        e.target.value = '';
                                    }}
                                />

                                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={uploadingType === 'stamp'}
                                        onClick={() => stampInputRef.current?.click()}
                                    >
                                        {uploadingType === 'stamp' ? (
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                                        )}
                                        {isId ? 'Unggah Stempel' : 'Upload Stamp'}
                                    </Button>

                                    {schoolStampUrl && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                            onClick={() => setSchoolStampUrl('')}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                                {isId ? 'Atau Tempel URL Stempel' : 'Or Paste Stamp URL'}
                            </label>
                            <input
                                type="url"
                                value={schoolStampUrl}
                                onChange={(e) => setSchoolStampUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* PRATINJAU GABUNGAN PENGESAHAN (TTD + STEMPEL) */}
            <Card className="border-border bg-card shadow-sm">
                <CardContent className="flex flex-col items-center justify-between gap-4 p-5 sm:flex-row">
                    <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="space-y-1">
                            <p className="font-semibold text-foreground">
                                {isId
                                    ? 'Pratinjau Pengesahan Digital (TTD + Stempel Terpisah)'
                                    : 'Digital Validation Preview (Separate Signature + Stamp)'}
                            </p>
                            <p>
                                {isId
                                    ? 'Gunakan format PNG dengan latar belakang transparan untuk TTD dan Stempel agar keduanya menyatu alami saat dicetak di Kartu Pelajar maupun Raport.'
                                    : 'Use transparent PNG files for both Signature and Stamp so they overlay cleanly when printed on Student ID Cards and Reports.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-center rounded-xl border border-border bg-white px-7 py-3 text-center text-slate-900 shadow-2xs">
                        <span className="text-[11px] text-slate-600">Kepala Sekolah,</span>
                        <div className="relative my-1 flex h-16 w-44 items-center justify-center">
                            {schoolStampUrl && (
                                <img
                                    src={schoolStampUrl}
                                    alt="Stempel"
                                    className="pointer-events-none absolute left-3 h-15 w-15 object-contain opacity-85 mix-blend-multiply"
                                />
                            )}
                            {principalSignatureUrl ? (
                                <img
                                    src={principalSignatureUrl}
                                    alt="TTD"
                                    className="relative z-10 h-14 max-w-36 object-contain"
                                />
                            ) : (
                                <span className="text-[10px] italic text-slate-400">
                                    {isId ? '(Area TTD)' : '(Signature)'}
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-bold underline">
                            {principalName || 'Nama Kepala Sekolah'}
                        </p>
                        {principalNip && (
                            <p className="font-mono text-[10px] text-slate-600">
                                NIP/NBM. {principalNip}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button
                    type="submit"
                    disabled={isSaving || uploadingType !== null}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                    {isSaving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="mr-2 h-4 w-4" />
                    )}
                    {isId ? 'Simpan Perubahan' : 'Save Changes'}
                </Button>
            </div>
        </form>
    );
}