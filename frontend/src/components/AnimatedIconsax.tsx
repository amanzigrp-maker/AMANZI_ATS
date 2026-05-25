import React from 'react';
import { motion } from 'framer-motion';
import * as Iconsax from 'iconsax-react';

interface AnimatedIconProps {
  icon: any;
  size?: number | string;
  color?: string;
  variant?: 'Linear' | 'Outline' | 'Broken' | 'Bold' | 'Bulk' | 'TwoTone';
  className?: string;
  animate?: boolean;
}

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  icon,
  size = 24,
  color = 'currentColor',
  variant = 'Linear',
  className = '',
  animate = true,
}) => {
  const IconComponent = Iconsax[icon] as any;

  if (!IconComponent) {
    console.warn(`Icon "${icon}" not found in iconsax-react`);
    return null;
  }

  const motionProps = animate ? {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    whileHover: { scale: 1.1, rotate: 5 },
    whileTap: { scale: 0.9 },
    transition: { type: 'spring' as const, stiffness: 300, damping: 20 }
  } : {};

  return (
    <motion.div className={`inline-flex items-center justify-center ${className}`} {...motionProps}>
      <IconComponent size={size} color={color} variant={variant} />
    </motion.div>
  );
};

// Map of common Lucide icons to Iconsax equivalents
export const IconMap = {
  LayoutDashboard: 'Element3',
  Briefcase: 'Briefcase',
  Users: 'People',
  Calendar: 'Calendar',
  BarChart3: 'Chart',
  Settings: 'Setting2',
  Search: 'SearchNormal1',
  Bell: 'Notification',
  ChevronLeft: 'ArrowLeft2',
  ChevronRight: 'ArrowRight3',
  Menu: 'HambergerMenu',
  X: 'CloseCircle',
  Eye: 'Eye',
  Edit: 'Edit2',
  Trash2: 'Trash',
  UserPlus: 'UserAdd',
  TrendingUp: 'TrendUp',
  TrendingDown: 'TrendDown',
  CheckCircle2: 'TickCircle',
  XCircle: 'CloseCircle',
  Clock: 'Clock',
  Upload: 'Export',
  Folder: 'Folder',
  FileText: 'DocumentText',
  MapPin: 'Location',
  Building: 'Buildings',
  Moon: 'Moon',
  Sun: 'Sun1',
  FileIcon: 'Document',
  MessageSquare: 'MessageText',
  ChevronDown: 'ArrowDown2',
  Sparkles: 'Magicpen',
  Plus: 'Add',
  MoreVertical: 'More',
  ArrowLeft: 'ArrowLeft',
  CheckCircle: 'TickCircle',
  Award: 'Award',
  Phone: 'Call',
  Mail: 'Sms',
  TrendingUpIcon: 'TrendUp',
  ArrowRight: 'ArrowRight',
  Filter: 'FilterSearch',
  Download: 'Import',
  Save: 'Save2',
  Linkedin: 'Link',
  Github: 'Link',
  Globe: 'Global',
  Star: 'Star',
  ThumbsUp: 'Like1',
  ThumbsDown: 'Dislike',
  Building2: 'Buildings2',
  DollarSign: 'EmptyWallet',
  LogOut: 'Logout',
  ClipboardList: 'Task',
  User: 'User',
  MessageCircle: 'MessageCircle',
  Heart: 'Heart',
  Share: 'Share',
  Copy: 'Copy',
  Check: 'TickCircle',
  AlertCircle: 'InfoCircle',
  Info: 'InfoCircle',
  ExternalLink: 'ExternalDrive',
  Grid: 'Category',
  List: 'TextalignLeft',
  Lock: 'Lock',
  Unlock: 'Unlock',
  Shield: 'ShieldTick',
  Zap: 'Flash',
  Flame: 'Direct',
  Target: 'Direct',
  Map: 'Map',
  Cloud: 'Cloud',
  Code: 'Code',
  Database: 'Data',
  Terminal: 'Command',
  Play: 'Play',
  Pause: 'Pause',
  SkipBack: 'Previous',
  SkipForward: 'Next',
  Repeat: 'RepeateOne',
  Shuffle: 'Shuffle',
  Volume2: 'VolumeHigh',
  VolumeX: 'VolumeCross',
  Mic: 'Microphone',
  Headphones: 'Headphone',
  Camera: 'Camera',
  Image: 'Image',
  Music: 'Music',
  Video: 'VideoSquare',
  Link: 'Link',
  Paperclip: 'Paperclip',
  Send: 'Send2',
  Archive: 'Archive',
  Inbox: 'Archive',
  Share2: 'Share',
  UserCheck: 'UserTick',
  UserX: 'UserRemove',
  FileUp: 'Export',
  Loader2: 'Refresh',
  Brain: 'Flash',
  EyeOff: 'EyeSlash',
  ShieldCheck: 'ShieldTick',
  CalendarCheck: 'CalendarTick',
  Twitter: 'Video',
};

export default AnimatedIcon;
