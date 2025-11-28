import React from 'react';

interface AlertModalProps {
    message: string;
    onClose: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1100]">
        <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center animate-in fade-in duration-200">
            <h3 className="font-bold text-lg mb-2 text-gray-800">提示</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-line">{message}</p>
            <button 
                onClick={onClose} 
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 w-full transition-colors"
            >
                确定
            </button>
        </div>
    </div>
);