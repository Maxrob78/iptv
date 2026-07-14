import React from 'react';

interface LoadingScreenProps {
  title?: string;
  subtitle?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  title = "Platinum Studio", 
  subtitle = "Initialisation du système..." 
}) => {
  return (
    <div className="fixed inset-0 z-[9998] bg-[#030303] flex items-center justify-center overflow-hidden select-none animate-in fade-in duration-500 font-['Inter']">
      
      {/* Cinematic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1a140a_0%,#030303_60%)] z-0" />

      {/* Ambient animated lights */}
      <div className="absolute w-[800px] h-[800px] bg-[radial-gradient(circle,rgba(181,146,77,0.15)_0%,transparent_60%)] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[breathe_8s_ease-in-out_infinite] z-[1]" />
      <div className="absolute w-[1200px] h-[1200px] bg-[radial-gradient(circle,rgba(255,255,255,0.02)_0%,transparent_60%)] rounded-full top-[30%] left-[30%] -translate-x-1/2 -translate-y-1/2 animate-[drift_15s_linear_infinite_alternate] z-[1]" />

      {/* Particles Container (Simulated with background pattern) */}
      <div className="absolute inset-0 z-[2] opacity-50 animate-[floatUp_60s_linear_infinite]" 
           style={{
             backgroundImage: 'radial-gradient(1px 1px at 20px 30px, #b5924d, rgba(0,0,0,0)), radial-gradient(1px 1px at 40px 70px, #fff, rgba(0,0,0,0)), radial-gradient(1.5px 1.5px at 90px 40px, #b5924d, rgba(0,0,0,0))',
             backgroundRepeat: 'repeat',
             backgroundSize: '200px 200px'
           }} 
      />
      
      <div className="relative z-10 flex flex-col items-center gap-12">
        
        {/* Glassmorphism Logo Box */}
        <div className="relative w-[140px] h-[140px] flex items-center justify-center">
          <div className="absolute inset-[-35px] rounded-full border border-transparent border-l-[2px] border-l-[#b5924d]/80 drop-shadow-[0_0_10px_#b5924d] animate-[spin_2s_linear_infinite] opacity-70" />
          <div className="absolute inset-[-15px] rounded-full border border-dashed border-white/10 border-r-[#b5924d]/30 animate-[spin-reverse_8s_linear_infinite]" />
          <div className="absolute inset-0 rounded-full border border-[#b5924d]/15 border-t-[#b5924d] border-b-[#b5924d]/50 animate-[spin_3s_cubic-bezier(0.68,-0.55,0.265,1.55)_infinite]" />
          
          <div className="relative w-[100px] h-[100px] rounded-[30px] bg-gradient-to-br from-[#b5924d]/40 to-black/80 backdrop-blur-xl border border-[#b5924d]/30 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.1),0_0_80px_rgba(181,146,77,0.3)] flex items-center justify-center animate-[float_6s_ease-in-out_infinite] z-20 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
            <span className="text-[48px] font-black bg-gradient-to-br from-white to-[#b5924d] text-transparent bg-clip-text font-serif italic drop-shadow-[0_0_30px_rgba(181,146,77,0.5)]">P</span>
          </div>
        </div>

        <div className="text-center flex flex-col gap-6 animate-[fadeIn_2s_ease-out]">
          <h2 className="m-0 text-[13px] font-extrabold uppercase tracking-[0.8em] bg-gradient-to-r from-white via-[#b5924d] to-white bg-clip-text text-transparent bg-[length:200%_auto] animate-[shine_4s_linear_infinite]">
            {title}
          </h2>
          <p className="m-0 text-[10px] font-light uppercase tracking-[0.6em] text-white/40">
            {subtitle}
          </p>
        </div>

        {/* Modern Loader */}
        <div className="w-[1px] h-[40px] bg-gradient-to-b from-transparent via-[#b5924d] to-transparent animate-[scan_2s_ease-in-out_infinite_alternate]" />
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
        }
        @keyframes drift {
          0% { transform: translate(-40%, -40%); }
          100% { transform: translate(-60%, -60%); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes shine {
          to { background-position: 200% center; }
        }
        @keyframes scan {
          0% { transform: scaleY(0.5); opacity: 0.3; }
          100% { transform: scaleY(1.5); opacity: 1; box-shadow: 0 0 20px #b5924d; }
        }
        @keyframes floatUp {
          from { background-position: 0 0; }
          to { background-position: 0 -1000px; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
};
