import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { TriangleAlert, RefreshCcw } from 'lucide-react';

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
        errorMsg: ''
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, errorMsg: error.message };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Tertangkap error:', error, errorInfo);
        localStorage.removeItem('auth-storage');
    }

    private handleReset = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-200 font-sans">
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-lg w-full">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <TriangleAlert className="w-8 h-8 text-red-500" />
                        </div>

                        <h1 className="text-2xl font-bold text-white mb-2">Aplikasi Mengalami Kendala</h1>
                        <p className="text-slate-400 text-sm mb-6">
                            Terjadi kesalahan fatal (kemungkinan karena data sesi / cache yang tidak sinkron).
                        </p>

                        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 mb-8 overflow-auto text-left">
                            <code className="text-xs text-red-400 font-mono">
                                {this.state.errorMsg || 'Unknown error occurred in React Tree.'}
                            </code>
                        </div>

                        <button
                            onClick={this.handleReset}
                            className="flex items-center justify-center w-full gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                        >
                            <RefreshCcw className="w-5 h-5" />
                            Reset Cache & Kembali ke Login
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}