"use client";

import { QRCodeSVG } from "qrcode.react";

export function QRCode({ value }: { value: string }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <QRCodeSVG
                value={value}
                size={140}
                bgColor="#ffffff"
                fgColor="#000000"
                level="Q"
            />
            <span className="text-xs text-gray-400 break-all text-center">
        {value}
      </span>
        </div>
    );
}