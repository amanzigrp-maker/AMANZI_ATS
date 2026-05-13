import React, { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";

interface CertificateTemplateProps {
  candidateName: string;
  candidatePhoto?: string;
  certificateId: string;
  issueDate?: string;
  testName?: string;
  score?: number;
  className?: string;
}

/**
 * CertificateTemplate - Finalized Amanzi v2 Production Engine.
 * Optimized for the 'Amanzi Master Template v2' with strict 'NAME' masking.
 */
export const CertificateTemplate: React.FC<CertificateTemplateProps> = ({
  candidateName,
  candidatePhoto,
  certificateId,
  issueDate = new Date().toISOString(),
  testName = "Professional Assessment",
  score = 0,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const cleanName = candidateName.replace(/[{}]/g, "").toUpperCase();
  const formattedDate = format(new Date(issueDate), "dd MMM yyyy");

  return (
    <div 
      ref={containerRef}
      className={`relative w-full aspect-[1123/794] bg-white overflow-hidden rounded-sm ${className}`}
      style={{ 
        isolation: 'isolate', 
        fontFamily: "'Inter', sans-serif",
        color: '#0A244D'
      }}
    >
      {/* 1. BORDERS */}
      <div className="absolute inset-0 border-[1.8vw] border-[#0A244D] z-10 pointer-events-none" />
      <div className="absolute inset-[2.6vw] border-[0.1vw] border-[#D4AF37] z-11 pointer-events-none" />
      
      {/* 2. WATERMARK */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] z-1 pointer-events-none">
        <svg className="w-[50%] h-[50%]" viewBox="0 0 100 100">
           <path d="M50 5 L95 95 L5 95 Z" fill="#1A3A6B" />
        </svg>
      </div>

      {/* 3. CONTENT LAYER */}
      <div className="relative z-20 h-full w-full flex flex-col p-[3.5vw] pt-[4.5vw]">
        
        {/* LOGO HEADER */}
        <div className="flex justify-center mb-[2vw]">
          <div className="flex items-baseline font-['Montserrat']">
            <span className="text-[5.5vw] font-black text-[#E31E24] leading-[0.8]">A</span>
            <span className="text-[3.8vw] font-extrabold text-[#00AEEF] tracking-[-0.15em] ml-[-0.2vw]">manzi</span>
          </div>
        </div>

        {/* MAIN BODY (Photo | Text | QR) */}
        <div className="flex-1 flex items-center justify-between gap-[2vw] mb-[1.5vw]">
          
          {/* PHOTO SIDE */}
          <div className="w-[12vw] flex flex-col items-center justify-center">
            <div className="w-[11vw] h-[14vw] bg-white p-[0.3vw] border border-slate-200 shadow-lg overflow-hidden">
              {candidatePhoto ? (
                <img src={candidatePhoto} alt="Candidate" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-300 font-bold text-[1vw]">PHOTO</div>
              )}
            </div>
          </div>

          {/* CENTER TEXT STACK */}
          <div className="flex-1 flex flex-col items-center text-center px-[1vw]">
            <h1 className="font-['Playfair_Display'] text-[4vw] font-black uppercase tracking-[0.3vw] mb-[0.2vw]">Certificate</h1>
            <span className="text-[1.1vw] font-bold text-[#B8860B] uppercase tracking-[0.6vw] border-t border-[#B8860B] pt-[0.5vw] mb-[3vw]">
              Of Professional Achievement
            </span>

            <p className="italic text-slate-500 text-[1.4vw] mb-[1vw]">This is to officially certify that</p>
            <h2 
              className="font-['Montserrat'] font-black uppercase text-[#0A244D] border-b-[0.2vw] border-double border-[#B8860B] pb-[0.3vw] mb-[1.5vw] w-full max-w-[85%]"
              style={{ fontSize: cleanName.length > 20 ? '2.8vw' : '3.6vw' }}
            >
              {cleanName}
            </h2>

            <p className="text-slate-700 text-[1.3vw] leading-normal max-w-[90%]">
              has successfully completed the comprehensive professional assessment for the high-impact role of
              <span className="block font-extrabold text-[#0A244D] text-[1.8vw] mt-[0.6vw] underline decoration-[#B8860B] decoration-[0.15vw] underline-offset-[0.3vw]">
                {testName}
              </span>
              demonstrating mastery in technical domains and engineering standards.
            </p>
          </div>

          {/* QR SIDE */}
          <div className="w-[12vw] flex flex-col items-center justify-center">
            <div className="bg-white p-[0.5vw] border border-slate-100 shadow-sm mb-[0.6vw]">
              <QRCodeSVG
                value={`${window.location.origin}/verify-certificate/${certificateId}`}
                size={256}
                level="H"
                className="w-[8vw] h-[8vw]"
              />
            </div>
            <p className="text-[0.7vw] font-extrabold text-[#B8860B] uppercase tracking-wider mb-[0.2vw]">Verify Certificate</p>
            <p className="font-mono font-black text-[0.8vw] text-[#0A244D]">{certificateId}</p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex justify-between items-end px-[1vw] mt-auto mb-[2.5vw]">
          {/* Date */}
          <div className="w-[22vw] flex flex-col items-start">
            <p className="text-[0.75vw] font-black text-slate-400 uppercase mb-[0.2vw]">Date of Issue</p>
            <p className="font-bold text-[1.1vw] text-[#0A244D]">{formattedDate}</p>
          </div>

          {/* Seal */}
          <div className="flex-1 flex justify-center">
            <div className="w-[7.5vw] h-[7.5vw] bg-[radial-gradient(circle,_#D4AF37,_#B8860B)] rounded-full border-[0.25vw] border-double border-white shadow-xl flex items-center justify-center -translate-y-[0.8vw]">
              <span className="text-white font-black text-[0.9vw] text-center leading-[1.1]">OFFICIAL<br/>VERIFIED<br/>AMANZI</span>
            </div>
          </div>

          {/* Signature */}
          <div className="w-[22vw] flex flex-col items-end">
            <p className="font-['Dancing_Script'] text-[2.8vw] text-[#0A244D] mb-[-0.8vw]">Prithvi Bisht</p>
            <div className="w-full h-[0.1vw] bg-slate-500 mb-[0.3vw]" />
            <p className="font-black text-[1.1vw] text-slate-700 uppercase leading-none">Prithvi Bisht</p>
            <p className="text-[0.75vw] text-slate-500 uppercase mt-[0.2vw]">Authorized Signatory, Amanzi Pvt. Ltd.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
