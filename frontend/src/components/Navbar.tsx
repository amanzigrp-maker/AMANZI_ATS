import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface DecodedToken {
  id: number;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLead, setIsLead] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const decodedToken: DecodedToken = jwtDecode(token);
        setIsLoggedIn(true);
        setIsAdmin(decodedToken.role === 'admin');
        setIsLead(decodedToken.role === 'lead');
      } catch (error) {
        console.error('Invalid token:', error);
        setIsLoggedIn(false);
        setIsAdmin(false);
        setIsLead(false);
      }
    } else {
      setIsLoggedIn(false);
      setIsAdmin(false);
      setIsLead(false);
    }
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsLoggedIn(false);
    setIsAdmin(false);
    setIsLead(false);
    navigate('/login');
  };

  const [activeTab, setActiveTab] = useState("Home");

  const navLinks = [
    { name: "Home", href: "#top" },
    { name: "Features", href: "#features" },
    { name: "Contact", href: "#contact" },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 py-6 pointer-events-none">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-3 items-center h-14 w-full">

          {/* Logo Section - Left */}
          <div className="pointer-events-auto justify-self-start">
            <Link to="/" className="inline-flex items-center gap-2 group">
              <img
                src="/assets/logo.png"
                alt="Amanzi"
                className="h-9 w-auto object-contain"
              />
            </Link>
          </div>

          {/* Navigation Capsules - Middle */}
          <div className="hidden md:flex items-center justify-self-center gap-1 p-1 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 pointer-events-auto">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setActiveTab(link.name)}
                className={`px-6 py-2 text-[13px] font-bold transition-all duration-300 rounded-full ${activeTab === link.name
                  ? "bg-white/10 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)] border border-white/10"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                {link.name}
              </a>
            ))}
            {isLoggedIn && (
              <Link
                to="/dashboard"
                onClick={() => setActiveTab("Dashboard")}
                className={`px-6 py-2 text-[13px] font-bold transition-all duration-300 rounded-full ${activeTab === "Dashboard"
                  ? "bg-white/10 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)] border border-white/10"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                Dashboard
              </Link>
            )}
            {isLoggedIn && (isAdmin || isLead) && (
              <Link
                to="/admin/dashboard"
                onClick={() => setActiveTab("Admin")}
                className={`px-6 py-2 text-[13px] font-bold transition-all duration-300 rounded-full ${activeTab === "Admin"
                  ? "bg-white/10 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)] border border-white/10"
                  : "text-slate-400 hover:text-white"
                  }`}
              >
                {isLead && !isAdmin ? 'Lead Panel' : 'Admin Panel'}
              </Link>
            )}
          </div>

          <div className="hidden md:flex items-center justify-self-end pointer-events-auto">
            <div className="flex items-center gap-1 p-1 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10">
              {isLoggedIn ? (
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/5 rounded-full px-6">
                  Log out
                </Button>
              ) : (
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/5 rounded-full px-6 font-bold">
                    Log in
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden ml-4 p-3 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-white pointer-events-auto hover:bg-white/5 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span className={`h-0.5 bg-white transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
              <span className={`h-0.5 bg-white transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 bg-white transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-24 left-4 right-4 p-8 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[2rem] pointer-events-auto md:hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-lg font-bold text-slate-400 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.name}
                </a>
              ))}
              <hr className="border-white/5 my-2" />
              {isLoggedIn ? (
                <>
                  <Link to="/dashboard" className="block" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="sm" className="w-full justify-start hover:bg-accent hover:translate-x-1 transition-all duration-200">
                      Dashboard
                    </Button>
                  </Link>
                  {(isAdmin || isLead) && (
                    <Link to="/admin/dashboard" className="block" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" size="sm" className="w-full justify-start hover:bg-accent hover:translate-x-1 transition-all duration-200">
                        {isLead && !isAdmin ? 'Lead Panel' : 'Admin Panel'}
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start hover:bg-destructive/10 hover:text-destructive hover:translate-x-1 transition-all duration-200"
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                  >
                    Log out
                  </Button>
                </>
              ) : (
                <Link to="/login" className="block" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="default" size="sm" className="w-full hover:scale-105 transition-transform duration-200">
                    Log in
                  </Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
