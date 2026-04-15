import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, ZoomIn, FileCheck, FileWarning } from 'lucide-react';
import * as mammoth from 'mammoth';

interface ResumePreviewProps {
    file: File;
    previewUrl: string | null;
}

export const ResumePreview: React.FC<ResumePreviewProps> = ({ file, previewUrl }) => {
    const [isHovering, setIsHovering] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [docxHtml, setDocxHtml] = useState<string | null>(null);
    const [isLoadingDocx, setIsLoadingDocx] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!imgRef.current) return;

        const rect = imgRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        setMousePos({ x, y });
        setContainerSize({ width: rect.width, height: rect.height });
    };

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isDoc = file.name.toLowerCase().endsWith('.doc') && !isDocx;

    useEffect(() => {
        if (isDocx && file) {
            setIsLoadingDocx(true);
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                try {
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    setDocxHtml(result.value);
                } catch (err) {
                    console.error('Error converting docx', err);
                    setDocxHtml('<p class="text-red-500">Failed to render preview of this Word document.</p>');
                } finally {
                    setIsLoadingDocx(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            setDocxHtml(null);
        }
    }, [file, isDocx]);

    return (
        <Card className="mt-6 relative group border-none shadow-none bg-transparent">
            <CardHeader className="bg-muted/50 pb-3 rounded-t-lg border">
                <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Resume Preview
                    </div>
                    {isImage && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-white px-2 py-0.5 rounded border shadow-sm">
                            <ZoomIn className="h-3 w-3" />
                            Roll over image to zoom
                        </div>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 relative rounded-b-lg border border-t-0 bg-white shadow-sm">
                {isImage ? (
                    <div
                        className="relative cursor-crosshair"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                        onMouseMove={handleMouseMove}
                    >
                        <img
                            ref={imgRef}
                            src={previewUrl || ''}
                            alt="Resume Preview"
                            className="w-full h-auto"
                        />

                        {isHovering && (
                            <>
                                {/* Amazon-style Dotted Lens - Stays inside the image container */}
                                <div
                                    className="absolute pointer-events-none z-10 border border-gray-400/50"
                                    style={{
                                        left: `${mousePos.x}%`,
                                        top: `${mousePos.y}%`,
                                        width: '180px',
                                        height: '140px',
                                        transform: 'translate(-50%, -50%)',
                                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                                        backgroundImage: `
                                            linear-gradient(45deg, rgba(0,0,0,0.1) 25%, transparent 25%), 
                                            linear-gradient(-45deg, rgba(0,0,0,0.1) 25%, transparent 25%), 
                                            linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.1) 75%), 
                                            linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.1) 75%)
                                        `,
                                        backgroundSize: '4px 4px',
                                        backgroundPosition: '0 0, 0 2px, 2px -2px, -2px 0px'
                                    }}
                                />

                                {/* Side Zoom Panel - Using FIXED to ensure it's NEVER hidden by overflow */}
                                <div
                                    className="fixed top-1/2 left-[calc(33%+40px)] -translate-y-1/2 z-[99999] border-4 border-white shadow-[0_20px_60px_rgba(0,0,0,0.3)] rounded-lg overflow-hidden hidden lg:block bg-white transition-all duration-150"
                                    style={{
                                        width: '650px',
                                        height: '850px',
                                        backgroundImage: previewUrl ? `url(${previewUrl})` : 'none',
                                        backgroundPosition: `${mousePos.x}% ${mousePos.y}%`,
                                        backgroundSize: '400%',
                                        backgroundRepeat: 'no-repeat',
                                        border: '1px solid #ddd'
                                    }}
                                >
                                    <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded text-xs font-bold backdrop-blur">
                                        AMAZON MAGNIFIER ACTIVE (4.0x)
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : isPdf ? (
                    <div className="relative group/pdf flex flex-col items-center bg-gray-50 p-4">
                        <div className="w-full max-w-2xl bg-white shadow-lg border rounded-sm overflow-hidden relative">
                            <div className="p-2 border-b bg-gray-100 flex items-center justify-between text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                                <span>High-Definition PDF Frame</span>
                                <span className="text-blue-600 animate-pulse">Scroll down to read content</span>
                            </div>
                            <iframe
                                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                className="w-full h-[900px] border-0"
                                title="Resume PDF"
                            />
                            {/* PDF specific interactive tip */}
                            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none opacity-0 group-hover/pdf:opacity-100 transition-opacity duration-1000">
                                <div className="bg-black/80 text-white text-[10px] px-4 py-2 rounded-full shadow-2xl backdrop-blur-sm border border-white/20 whitespace-nowrap">
                                    💡 Tip: Use `Ctrl + MouseWheel` to zoom in further
                                </div>
                            </div>
                        </div>
                    </div>
                ) : isDocx ? (
                    <div className="p-8 bg-white min-h-[600px] overflow-y-auto resume-docx-preview">
                        {isLoadingDocx ? (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                <p className="text-sm font-medium text-gray-500">Converting Word Document...</p>
                            </div>
                        ) : docxHtml ? (
                            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: docxHtml }} />
                        ) : (
                            <div className="text-center">
                                <FileWarning className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                                <p className="text-sm text-gray-500">Could not generate preview for this document.</p>
                            </div>
                        )}
                    </div>
                ) : isDoc ? (
                    <div className="p-12 text-center bg-blue-50/30 border-2 border-dashed border-blue-100 rounded-lg m-4">
                        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileCheck className="h-8 w-8 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Microsoft Word (.doc)</h3>
                        <p className="text-sm text-gray-600 mb-6 max-w-sm mx-auto">
                            Modern browsers cannot directly preview old .doc files. We will still parse your resume accurately!
                        </p>
                        <div className="flex flex-col gap-2 max-w-xs mx-auto">
                            <Badge variant="outline" className="py-2 justify-center">
                                Parsing Still Works Fine
                            </Badge>
                            <p className="text-[10px] text-gray-400 mt-2 italic">
                                Tip: Saving as .PDF or .DOCX will enable live preview.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center bg-gray-50">
                        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Preview not available for this file type</p>
                        <p className="text-xs text-gray-400">{file.name}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
