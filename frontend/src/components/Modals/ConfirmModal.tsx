import React from 'react';

interface ConfirmModalProps {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100]">
        <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center animate-in fade-in duration-200">
            <h3 className="font-bold text-lg mb-2 text-gray-800">确认操作</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-line">{message}</p>
            <div className="flex gap-3">
                <button 
                    onClick={onCancel} 
                    className="flex-1 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-gray-700"
                >
                    取消
                </button>
                <button 
                    onClick={onConfirm} 
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                >
                    确认
                </button>
            </div>
        </div>
    </div>
);