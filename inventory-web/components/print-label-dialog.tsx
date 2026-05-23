"use client";

import { useRef, useState } from "react";
import { Download, FileImage, Printer, Tag } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
    name: string;
    qrValue: string;
    detail: string;
    detailLabel: string;
    onDownloadXlsx?: () => void;
    isDownloadingXlsx?: boolean;
};

function fitDetail(value: string) {
    const clean = value.trim();

    if (!clean) {
        return "-";
    }

    return clean.length > 58 ? `${clean.slice(0, 55)}...` : clean;
}

function fitTitle(value: string) {
    const clean = value.trim();

    if (!clean) {
        return "Untitled";
    }

    return clean.length > 34 ? `${clean.slice(0, 31)}...` : clean;
}

function detailLines(value: string) {
    const text = fitDetail(value);
    const words = text.split(/\s+/);
    const lines: string[] = [];

    for (const word of words) {
        const last = lines[lines.length - 1];

        if (!last) {
            lines.push(word);
        } else if (`${last} ${word}`.length <= 10) {
            lines[lines.length - 1] = `${last} ${word}`;
        } else if (lines.length < 4) {
            lines.push(word);
        }
    }

    return lines.slice(0, 4);
}

function downloadUrl(url: string, filename: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
}

export function PrintLabelDialog({ name, qrValue, detail, detailLabel, onDownloadXlsx, isDownloadingXlsx }: Props) {
    const [open, setOpen] = useState(false);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const title = fitTitle(name);
    const lines = detailLines(detail);

    const downloadSvg = () => {
        if (!svgRef.current) {
            return;
        }

        const source = new XMLSerializer().serializeToString(svgRef.current);
        const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        downloadUrl(url, `${title}.svg`);
        URL.revokeObjectURL(url);
    };

    const downloadPng = () => {
        if (!svgRef.current) {
            return;
        }

        const source = new XMLSerializer().serializeToString(svgRef.current);
        const image = new Image();
        const svgUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 696;
            canvas.height = 480;
            const context = canvas.getContext("2d");

            if (!context) {
                URL.revokeObjectURL(svgUrl);
                return;
            }

            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) {
                    URL.revokeObjectURL(svgUrl);
                    return;
                }

                const pngUrl = URL.createObjectURL(blob);
                downloadUrl(pngUrl, `${title}.png`);
                URL.revokeObjectURL(pngUrl);
                URL.revokeObjectURL(svgUrl);
            }, "image/png");
        };

        image.src = svgUrl;
    };

    return (
        <>
            <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
                <Tag className="h-4 w-4" />
                Show print label
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl print-label-dialog">
                    <DialogHeader className="no-print">
                        <DialogTitle>Print label</DialogTitle>
                        <DialogDescription>40x58 mm label preview with QR code.</DialogDescription>
                    </DialogHeader>

                    <div className="print-label-print-root flex flex-col items-center gap-4">
                        <svg
                            ref={svgRef}
                            className="print-label-sheet"
                            viewBox="0 0 580 400"
                            xmlns="http://www.w3.org/2000/svg"
                            role="img"
                            aria-label={`${title} print label`}
                        >
                            <rect x="1" y="1" width="578" height="398" fill="#ffffff" stroke="#111827" strokeWidth="2" />
                            <text
                                x="290"
                                y="58"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#111827"
                                fontFamily="Arial, Helvetica, sans-serif"
                                fontSize="34"
                                fontWeight="700"
                            >
                                {title}
                            </text>
                            <line x1="24" y1="94" x2="556" y2="94" stroke="#111827" strokeWidth="2" />

                            <QRCodeSVG value={qrValue} x={34} y={132} size={210} level="Q" />

                            <line x1="284" y1="118" x2="284" y2="370" stroke="#d1d5db" strokeWidth="2" />
                            <text
                                x="420"
                                y="150"
                                textAnchor="middle"
                                fill="#6b7280"
                                fontFamily="Arial, Helvetica, sans-serif"
                                fontSize="18"
                                fontWeight="700"
                            >
                                {detailLabel.toUpperCase()}
                            </text>
                            <text
                                x="420"
                                y="205"
                                textAnchor="middle"
                                fill="#111827"
                                fontFamily="Arial, Helvetica, sans-serif"
                                fontSize="32"
                                fontWeight="700"
                            >
                                {lines.map((line, index) => (
                                    <tspan key={`${line}-${index}`} x="420" dy={index === 0 ? 0 : 38}>
                                        {line}
                                    </tspan>
                                ))}
                            </text>
                        </svg>

                        <div className="no-print flex flex-wrap justify-center gap-2">
                            <Button onClick={() => window.print()}>
                                <Printer className="h-4 w-4" />
                                Print label
                            </Button>
                            {onDownloadXlsx ? (
                                <Button variant="outline" onClick={onDownloadXlsx} disabled={isDownloadingXlsx}>
                                    <Download className="h-4 w-4" />
                                    {isDownloadingXlsx ? "Preparing..." : "XLSX"}
                                </Button>
                            ) : (
                                <Button variant="outline" onClick={downloadSvg}>
                                    <Download className="h-4 w-4" />
                                    SVG
                                </Button>
                            )}
                            <Button variant="outline" onClick={downloadPng}>
                                <FileImage className="h-4 w-4" />
                                PNG
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
