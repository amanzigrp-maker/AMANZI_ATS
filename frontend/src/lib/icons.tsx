import * as React from "react";
import type { IconType } from "react-icons";
import {
  MdAdd,
  MdArrowBack,
  MdArrowDownward,
  MdArrowForward,
  MdArrowUpward,
  MdAssessment,
  MdAttachMoney,
  MdAutoAwesome,
  MdBarChart,
  MdBusiness,
  MdCalendarMonth,
  MdCampaign,
  MdCalendarToday,
  MdCategory,
  MdCheck,
  MdCheckBox,
  MdCheckCircle,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdCloudUpload,
  MdCode,
  MdConstruction,
  MdDelete,
  MdDarkMode,
  MdDescription,
  MdDownload,
  MdDragIndicator,
  MdEdit,
  MdEmojiEvents,
  MdError,
  MdEventAvailable,
  MdFilterAlt,
  MdFolderOpen,
  MdGpsFixed,
  MdGppBad,
  MdFingerprint,
  MdHomeWork,
  MdInsertChart,
  MdInsertDriveFile,
  MdKey,
  MdLanguage,
  MdLightMode,
  MdLogin,
  MdMail,
  MdMemory,
  MdMenu,
  MdMoreHoriz,
  MdNorthEast,
  MdNoteAlt,
  MdNotifications,
  MdOpenInFull,
  MdPauseCircle,
  MdPeople,
  MdPerson,
  MdPersonAdd,
  MdPhone,
  MdPlace,
  MdPsychology,
  MdRefresh,
  MdRadioButtonUnchecked,
  MdRemoveRedEye,
  MdSave,
  MdSchedule,
  MdSchool,
  MdScreenShare,
  MdSearch,
  MdSend,
  MdSettings,
  MdShare,
  MdShield,
  MdShieldMoon,
  MdSpaceDashboard,
  MdStar,
  MdTerminal,
  MdThumbDown,
  MdThumbUp,
  MdTimer,
  MdTrendingDown,
  MdTrendingUp,
  MdUploadFile,
  MdVerifiedUser,
  MdVideocam,
  MdVideocamOff,
  MdViewSidebar,
  MdVpnKey,
  MdWarning,
  MdWork,
  MdWorkspacePremium,
  MdZoomIn,
  MdChecklist,
  MdBolt,
  MdCancel,
} from "react-icons/md";
import { HiMiniEllipsisHorizontal } from "react-icons/hi2";
import { FaGithub, FaLinkedinIn, FaTwitter } from "react-icons/fa6";

export type IconProps = React.SVGProps<SVGSVGElement> & {
  color?: string;
  size?: string | number;
  strokeWidth?: string | number;
  absoluteStrokeWidth?: boolean;
};

type IconComponent = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement>
>;

function createIcon(BaseIcon: IconType): IconComponent {
  return React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 20, className, style, ...props },
    ref
  ) {
    return (
      <BaseIcon
        ref={ref}
        size={size}
        className={className}
        style={style}
        {...props}
      />
    );
  });
}

const fallbackIcon = createIcon(MdCategory);

function alias(icon: IconType): IconComponent {
  return createIcon(icon);
}

export const Activity = alias(MdInsertChart);
export const AlertCircle = alias(MdError);
export const AlertTriangle = alias(MdWarning);
export const ArrowLeft = alias(MdArrowBack);
export const ArrowRight = alias(MdArrowForward);
export const Award = alias(MdWorkspacePremium ?? MdStar);
export const BarChart3 = alias(MdBarChart);
export const Bell = alias(MdNotifications);
export const Brain = alias(MdPsychology);
export const BrainCircuit = alias(MdPsychology);
export const Briefcase = alias(MdWork);
export const Building = alias(MdBusiness);
export const Building2 = alias(MdHomeWork);
export const Calendar = alias(MdCalendarToday);
export const CalendarCheck = alias(MdEventAvailable);
export const CalendarDays = alias(MdCalendarMonth);
export const Check = alias(MdCheck);
export const CheckCircle = alias(MdCheckCircle);
export const CheckCircle2 = alias(MdCheckCircle);
export const ChevronDown = alias(MdArrowDownward);
export const ChevronLeft = alias(MdChevronLeft);
export const ChevronRight = alias(MdChevronRight);
export const ChevronUp = alias(MdArrowUpward);
export const Circle = alias(MdPauseCircle);
export const ClipboardList = alias(MdChecklist ?? MdDescription);
export const Clock = alias(MdSchedule);
export const Cloud = alias(MdCloudUpload);
export const Code = alias(MdCode);
export const Cpu = alias(MdMemory ?? MdConstruction);
export const Dot = alias(MdRadioButtonUnchecked);
export const DollarSign = alias(MdAttachMoney);
export const Download = alias(MdDownload);
export const Edit = alias(MdEdit);
export const Edit2 = alias(MdEdit);
export const Edit3 = alias(MdEdit);
export const Eye = alias(MdRemoveRedEye);
export const EyeOff = alias(MdShieldMoon);
export const FileCheck = alias(MdDescription);
export const FileIcon = alias(MdInsertDriveFile);
export const FileText = alias(MdDescription);
export const FileUp = alias(MdUploadFile);
export const FileWarning = alias(MdDescription);
export const Filter = alias(MdFilterAlt);
export const Fingerprint = alias(MdFingerprint);
export const FolderUp = alias(MdFolderOpen);
export const Github = alias(FaGithub);
export const Globe = alias(MdLanguage);
export const GraduationCap = alias(MdSchool ?? MdWorkspacePremium);
export const GripVertical = alias(MdDragIndicator);
export const KeyRound = alias(MdVpnKey ?? MdKey);
export const LayoutDashboard = alias(MdSpaceDashboard);
export const Linkedin = alias(FaLinkedinIn);
export const Loader2 = alias(MdRefresh);
export const Lock = alias(MdShield);
export const LogIn = alias(MdLogin);
export const Mail = alias(MdMail);
export const MapPin = alias(MdPlace);
export const Maximize = alias(MdOpenInFull);
export const Megaphone = alias(MdCampaign);
export const Menu = alias(MdMenu);
export const MessageSquare = alias(MdMail);
export const MicOff = alias(MdVideocamOff);
export const MonitorPlay = alias(MdScreenShare);
export const Moon = alias(MdDarkMode ?? MdShieldMoon);
export const MoreHorizontal = alias(MdMoreHoriz);
export const MoreVertical = alias(HiMiniEllipsisHorizontal);
export const PanelLeft = alias(MdViewSidebar ?? MdSpaceDashboard);
export const Phone = alias(MdPhone);
export const Plus = alias(MdAdd);
export const RefreshCw = alias(MdRefresh);
export const Save = alias(MdSave);
export const ScrollText = alias(MdNoteAlt);
export const Search = alias(MdSearch);
export const Send = alias(MdSend);
export const SendHorizontal = alias(MdSend);
export const Settings = alias(MdSettings);
export const Share2 = alias(MdShare);
export const Shield = alias(MdShield);
export const ShieldAlert = alias(MdGppBad);
export const ShieldCheck = alias(MdVerifiedUser);
export const Sparkles = alias(MdAutoAwesome);
export const Star = alias(MdStar);
export const Sun = alias(MdLightMode);
export const Target = alias(MdGpsFixed ?? MdNorthEast);
export const Terminal = alias(MdTerminal);
export const ThumbsDown = alias(MdThumbDown);
export const ThumbsUp = alias(MdThumbUp);
export const Timer = alias(MdTimer);
export const Trash2 = alias(MdDelete ?? MdClose);
export const TrendingDown = alias(MdTrendingDown);
export const TrendingUp = alias(MdTrendingUp);
export const Trophy = alias(MdEmojiEvents ?? MdStar);
export const Twitter = alias(FaTwitter);
export const Upload = alias(MdCloudUpload);
export const User = alias(MdPerson);
export const UserCheck = alias(MdVerifiedUser);
export const UserPlus = alias(MdPersonAdd);
export const Users = alias(MdPeople);
export const Video = alias(MdVideocam);
export const X = alias(MdClose);
export const XCircle = alias(MdCancel ?? MdClose);
export const Zap = alias(MdBolt ?? MdAutoAwesome);
export const ZoomIn = alias(MdZoomIn);

export default fallbackIcon;
