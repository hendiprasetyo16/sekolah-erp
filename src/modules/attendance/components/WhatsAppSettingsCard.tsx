// src/modules/attendance/components/WhatsAppSettingsCard.tsx
import React, { useEffect, useState } from 'react';
import {
    MessageSquare,
    Save,
    Send,
    Eye,
    EyeOff,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    Info,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
    getSchoolWaConfig,
    saveSchoolWaConfig,
    sendTestWhatsAppMessage,
    type SchoolWaConfig,
    WA_PROVIDER_PRESETS,
    type WaGatewayProvider,
} from '../services/whatsappService';

interface WhatsAppSettingsCardProps {
    schoolId: string;
}

export const WhatsAppSettingsCard: React.FC<WhatsAppSettingsCardProps> = ({
    schoolId,
}) => {
    const { t } = useTranslation();

    const [config, setConfig] = useState<SchoolWaConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    useEffect(() => {
        if (!schoolId) return;
        let active = true;
        setLoading(true);
        setFeedback(null);

        getSchoolWaConfig(schoolId)
            .then((res) => {
                if (active) setConfig(res);
            })
            .catch((err) => {
                if (active) {
                    setFeedback({
                        type: 'error',
                        text:
                            err?.message || t('attendanceSettings.errLoadWaConfig'),
                    });
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [schoolId, t]);

    const handleProviderChange = (provider: WaGatewayProvider) => {
        if (!config) return;
        setConfig({
            ...config,
            provider,
            apiUrl: WA_PROVIDER_PRESETS[provider].defaultUrl,
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config || !schoolId) return;
        setSaving(true);
        setFeedback(null);
        try {
            await saveSchoolWaConfig(config);
            setFeedback({
                type: 'success',
                text: t('attendanceSettings.feedbackWaSaved'),
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : t('attendanceSettings.errSaveWaConfig'),
            });
        } finally {
            setSaving(false);
        }
    };

    const handleTestSend = async () => {
        if (!config || !schoolId || !testPhone.trim()) {
            setFeedback({
                type: 'error',
                text: t('attendanceSettings.errEnterTestPhone'),
            });
            return;
        }
        setTesting(true);
        setFeedback(null);
        try {
            await saveSchoolWaConfig(config);
            const res = await sendTestWhatsAppMessage(schoolId, testPhone.trim());
            setFeedback({
                type: res.success ? 'success' : 'error',
                text: res.message,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : t('attendanceSettings.errTestWaSend'),
            });
        } finally {
            setTesting(false);
        }
    };

    if (!schoolId) {
        return (
            <div className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground">
                {t('attendanceSettings.waSelectSchoolFirst')}
            </div>
        );
    }

    if (loading || !config) {
        return (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    {t('attendanceSettings.waLoadingConfig')}
                </div>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSave}
            className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
        >
            {/* Header & Saklar Utama */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold">
                            {t('attendanceSettings.waCardTitle')}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t('attendanceSettings.waCardSubtitle')}
                        </p>
                    </div>
                </div>

                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none px-3.5 py-2 rounded-xl border border-border bg-muted/30">
                    <input
                        type="checkbox"
                        checked={config.isEnabled}
                        onChange={(e) =>
                            setConfig({ ...config, isEnabled: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-border accent-emerald-600 cursor-pointer"
                    />
                    <span className="text-xs font-bold">
                        {config.isEnabled
                            ? t('attendanceSettings.waStatusActive')
                            : t('attendanceSettings.waStatusInactive')}
                    </span>
                </label>
            </div>

            {feedback && (
                <div
                    className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${feedback.type === 'success'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/40'
                        : 'bg-red-500/15 text-red-700 dark:text-red-200 border-red-500/40'
                        }`}
                >
                    {feedback.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <span>{feedback.text}</span>
                </div>
            )}

            {/* Konfigurasi Provider & Kredensial */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        {t('attendanceSettings.waProviderLabel')}
                    </label>
                    <select
                        value={config.provider}
                        onChange={(e) =>
                            handleProviderChange(e.target.value as WaGatewayProvider)
                        }
                        className="form-input w-full text-xs"
                    >
                        {(Object.keys(WA_PROVIDER_PRESETS) as WaGatewayProvider[]).map(
                            (key) => (
                                <option key={key} value={key}>
                                    {WA_PROVIDER_PRESETS[key].label}
                                </option>
                            )
                        )}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        {t('attendanceSettings.waApiUrlLabel')}
                    </label>
                    <input
                        type="url"
                        required
                        value={config.apiUrl}
                        onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                        placeholder="https://api.fonnte.com/send"
                        className="form-input w-full text-xs font-mono"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        {t('attendanceSettings.waApiTokenLabel')}
                    </label>
                    <div className="relative">
                        <input
                            type={showToken ? 'text' : 'password'}
                            value={config.apiToken}
                            onChange={(e) =>
                                setConfig({ ...config, apiToken: e.target.value })
                            }
                            placeholder={
                                WA_PROVIDER_PRESETS[config.provider]?.tokenHint ??
                                t('attendanceSettings.waApiTokenPlaceholder')
                            }
                            className="form-input w-full pr-10 text-xs font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                            title={
                                showToken
                                    ? t('attendanceSettings.titleHideToken')
                                    : t('attendanceSettings.titleShowToken')
                            }
                        >
                            {showToken ? (
                                <EyeOff className="h-4 w-4" />
                            ) : (
                                <Eye className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        {t('attendanceSettings.waSenderLabel')}
                    </label>
                    <input
                        type="text"
                        value={config.senderNumber || ''}
                        onChange={(e) =>
                            setConfig({ ...config, senderNumber: e.target.value })
                        }
                        placeholder="6281234567890"
                        className="form-input w-full text-xs font-mono"
                    />
                </div>
            </div>

            {/* Pilihan Pemicu Notifikasi */}
            <div className="rounded-xl bg-muted/35 p-4 border border-border space-y-2.5">
                <span className="block text-xs font-bold">
                    {t('attendanceSettings.waTriggerHeading')}
                </span>
                <div className="flex flex-wrap gap-6">
                    <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.notifyOnCheckIn}
                            onChange={(e) =>
                                setConfig({ ...config, notifyOnCheckIn: e.target.checked })
                            }
                            className="rounded border-border accent-emerald-600 cursor-pointer"
                        />
                        {t('attendanceSettings.waTriggerCheckIn')}
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.notifyOnLate}
                            onChange={(e) =>
                                setConfig({ ...config, notifyOnLate: e.target.checked })
                            }
                            className="rounded border-border accent-emerald-600 cursor-pointer"
                        />
                        {t('attendanceSettings.waTriggerLate')}
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.notifyOnCheckOut}
                            onChange={(e) =>
                                setConfig({ ...config, notifyOnCheckOut: e.target.checked })
                            }
                            className="rounded border-border accent-emerald-600 cursor-pointer"
                        />
                        {t('attendanceSettings.waTriggerCheckOut')}
                    </label>
                </div>
            </div>

            {/* Template Pesan Dinamis */}
            <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-200 border border-blue-500/30">
                    <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                    <div>
                        {t('attendanceSettings.waVariablesHint')}{' '}
                        <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-border">
                            {'{nama_siswa}'}
                        </code>
                        ,{' '}
                        <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-border">
                            {'{kelas}'}
                        </code>
                        ,{' '}
                        <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-border">
                            {'{waktu}'}
                        </code>
                        ,{' '}
                        <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-border">
                            {'{status}'}
                        </code>
                        ,{' '}
                        <code className="font-mono bg-card px-1.5 py-0.5 rounded border border-border">
                            {'{nama_sekolah}'}
                        </code>
                        .
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            {t('attendanceSettings.waTemplateCheckInLabel')}
                        </label>
                        <textarea
                            rows={3}
                            value={config.templateCheckIn}
                            onChange={(e) =>
                                setConfig({ ...config, templateCheckIn: e.target.value })
                            }
                            className="form-input w-full text-xs leading-relaxed"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            {t('attendanceSettings.waTemplateCheckOutLabel')}
                        </label>
                        <textarea
                            rows={3}
                            value={config.templateCheckOut}
                            onChange={(e) =>
                                setConfig({ ...config, templateCheckOut: e.target.value })
                            }
                            className="form-input w-full text-xs leading-relaxed"
                        />
                    </div>
                </div>
            </div>

            {/* Uji Coba & Tombol Simpan */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                    <input
                        type="tel"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder={t('attendanceSettings.waTestPhonePlaceholder')}
                        className="form-input w-48 text-xs py-2"
                    />
                    <button
                        type="button"
                        disabled={testing || saving}
                        onClick={handleTestSend}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs active:scale-[0.98] transition-all duration-200 disabled:opacity-50 cursor-pointer"
                    >
                        {testing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Send className="h-3.5 w-3.5 text-blue-500" />
                        )}
                        {t('attendanceSettings.btnTestWa')}
                    </button>
                </div>

                <button
                    type="submit"
                    disabled={saving || testing}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-sm shadow-emerald-600/20 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 cursor-pointer"
                >
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    {t('attendanceSettings.btnSaveWa')}
                </button>
            </div>
        </form>
    );
};