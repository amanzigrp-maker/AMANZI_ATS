import { Link } from "react-router-dom";
import { Linkedin, Twitter, Github, Mail } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="relative overflow-hidden pt-12 pb-20">
      {/* Footer Ambient Glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Brand - Span 5 cols */}
          <div className="md:col-span-5 space-y-6">
            <Link to="/" className="flex items-center gap-2 group">
              <img
                src="/assets/logo.png"
                alt="Amanzi ATS"
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs font-medium">
              Transforming the way modern teams find, evaluate, and hire the world's best talent.
            </p>
            <div className="flex items-center gap-3">
              {[
                { icon: Twitter, href: "#" },
                { icon: Linkedin, href: "#" },
                { icon: Github, href: "#" },
                { icon: Mail, href: "#" }
              ].map((social, i) => (
                <a
                  key={i}
                  href={social.href}
                  className="w-10 h-10 rounded-full bg-card/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 hover:border-blue-500 transition-all duration-300"
                >
                  <social.icon size={18} />
                </a>
              ))}
            </div>
          </div>

          {/* Product - Span 2 cols */}
          <div className="md:col-span-2 space-y-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest font-heading">Product</h3>
            <ul className="space-y-4">
              {['Features', 'Pricing', 'Integrations', 'FAQ'].map((link) => (
                <li key={link}>
                  <a href={`#${link.toLowerCase()}`} className="text-sm text-slate-400 hover:text-blue-400 transition-colors duration-200">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company - Span 2 cols */}
          <div className="md:col-span-2 space-y-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest font-heading">Company</h3>
            <ul className="space-y-4">
              {['About Us', 'Careers', 'Blog', 'Contact'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-slate-400 hover:text-blue-400 transition-colors duration-200">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal - Span 3 cols */}
          <div className="md:col-span-3 space-y-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest font-heading">Legal</h3>
            <ul className="space-y-4">
              {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-slate-400 hover:text-blue-400 transition-colors duration-200">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-muted-foreground font-medium">
            © {new Date().getFullYear()} Amanzi ATS. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
            </div>
            <div className="h-4 w-px bg-card/10 hidden md:block" />
          </div>
        </div>
      </div>
    </footer>
  );
};
