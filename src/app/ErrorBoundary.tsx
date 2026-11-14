// src/app/ErrorBoundary.tsx
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { TriangleAlert, RefreshCcw, RotateCw } from 'lucide-react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    errorMsg: string;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        errorMsg: '',
    };

    public static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            errorMsg: error?.message || 'Terjadi kesalahan pada antarmuka aplikasi.',
        };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Tertangkap error aplikasi:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleHardReset = () => {
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch {
            // Abaikan jika akses storage dibatasi browser
        }
        window.location.replace('/login');
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-dvh bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-200 font-sans">
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-lg w-full">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <TriangleAlert className="w-8 h-8 text-red-500" />
                        </div>

                        <h1 className="text-2xl font-bold text-white mb-2">
                            Aplikasi Mengalami Kendala
                        </h1>
                        <p className="text-slate-400 text-sm mb-6">
                            Terjadi kesalahan saat menampilkan halaman. Anda dapat mencoba memuat ulang
                            halaman terlebih dahulu atau mereset sesi jika kendala berlanjut.
                        </p>

                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 mb-6 overflow-auto text-left max-h-36">
                            <code className="text-xs text-red-400 font-mono wrap-break-word">
                                {this.state.errorMsg}
                            </code>
                        </div>

                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="flex items-center justify-center w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                            >
                                <RotateCw className="w-4 h-4" />
                                Muat Ulang Halaman
                            </button>

                            <button
                                type="button"
                                onClick={this.handleHardReset}
                                className="flex items-center justify-center w-full gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors"
                            >
                                <RefreshCcw className="w-4 h-4" />
                                Reset Cache &amp; Kembali ke Login
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}