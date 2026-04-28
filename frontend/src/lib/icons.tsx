import * as React from "react";
import type { Icon, IconProps as PhosphorIconProps } from "@phosphor-icons/react";
import {
  ArrowsOutSimple as PhArrowsOutSimple,
  ArrowLeft as PhArrowLeft,
  ArrowLineRight as PhArrowLineRight,
  Bell as PhBell,
  Brain as PhBrain,
  Briefcase as PhBriefcase,
  Building as PhBuilding,
  Buildings as PhBuildings,
  Calendar as PhCalendar,
  CalendarBlank as PhCalendarBlank,
  CalendarCheck as PhCalendarCheck,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  ChartBar as PhChartBar,
  ChatCircleText as PhChatCircleText,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Circle as PhCircle,
  Clock as PhClock,
  ClockCountdown as PhClockCountdown,
  CloudArrowUp as PhCloudArrowUp,
  Code as PhCode,
  Cpu as PhCpu,
  CurrencyDollarSimple as PhCurrencyDollarSimple,
  DotOutline as PhDotOutline,
  DownloadSimple as PhDownloadSimple,
  DotsThree as PhDotsThree,
  DotsThreeVertical as PhDotsThreeVertical,
  EnvelopeSimple as PhEnvelopeSimple,
  Exam as PhExam,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  FileArrowUp as PhFileArrowUp,
  FileText as PhFileText,
  Fingerprint as PhFingerprint,
  FloppyDisk as PhFloppyDisk,
  FolderSimple as PhFolderSimple,
  Gear as PhGear,
  GithubLogo as PhGithubLogo,
  GlobeHemisphereWest as PhGlobeHemisphereWest,
  GraduationCap as PhGraduationCap,
  IdentificationCard as PhIdentificationCard,
  Key as PhKey,
  Lightning as PhLightning,
  LinkedinLogo as PhLinkedinLogo,
  List as PhList,
  ListChecks as PhListChecks,
  LockSimple as PhLockSimple,
  MagnifyingGlass as PhMagnifyingGlass,
  MapPin as PhMapPin,
  MicrophoneSlash as PhMicrophoneSlash,
  MonitorPlay as PhMonitorPlay,
  Moon as PhMoon,
  Notepad as PhNotepad,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Password as PhPassword,
  PencilSimple as PhPencilSimple,
  Phone as PhPhone,
  Plus as PhPlus,
  PresentationChart as PhPresentationChart,
  SealCheck as PhSealCheck,
  ShareNetwork as PhShareNetwork,
  Shield as PhShield,
  ShieldWarning as PhShieldWarning,
  SidebarSimple as PhSidebarSimple,
  Sparkle as PhSparkle,
  SquaresFour as PhSquaresFour,
  Star as PhStar,
  Sun as PhSun,
  Target as PhTarget,
  Terminal as PhTerminal,
  ThumbsDown as PhThumbsDown,
  ThumbsUp as PhThumbsUp,
  TrendDown as PhTrendDown,
  TrendUp as PhTrendUp,
  Trophy as PhTrophy,
  TrashSimple as PhTrashSimple,
  TwitterLogo as PhTwitterLogo,
  UploadSimple as PhUploadSimple,
  User as PhUser,
  UserCheck as PhUserCheck,
  UserPlus as PhUserPlus,
  UsersThree as PhUsersThree,
  VideoCamera as PhVideoCamera,
  X as PhX,
  XCircle as PhXCircle,
} from "@phosphor-icons/react";

export type IconProps = Omit<PhosphorIconProps, "weight"> & {
  strokeWidth?: string | number;
  absoluteStrokeWidth?: boolean;
};

type IconComponent = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement>
>;

function createIcon(BaseIcon: Icon, weight: PhosphorIconProps["weight"] = "bold"): IconComponent {
  return React.forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 20, className, style, ...props },
    ref
  ) {
    return (
      <BaseIcon
        ref={ref}
        size={size}
        weight={weight}
        className={className}
        style={style}
        {...props}
      />
    );
  });
}

function alias(icon: Icon, weight: PhosphorIconProps["weight"] = "bold"): IconComponent {
  return createIcon(icon, weight);
}

const fallbackIcon = alias(PhSquaresFour);

export const Activity = alias(PhPresentationChart);
export const AlertCircle = alias(PhXCircle);
export const AlertTriangle = alias(PhShieldWarning);
export const ArrowLeft = alias(PhArrowLeft);
export const ArrowRight = alias(PhArrowLineRight);
export const Award = alias(PhTrophy);
export const BarChart3 = alias(PhChartBar);
export const Bell = alias(PhBell);
export const Brain = alias(PhBrain);
export const BrainCircuit = alias(PhBrain);
export const Briefcase = alias(PhBriefcase);
export const Building = alias(PhBuilding);
export const Building2 = alias(PhBuildings);
export const Calendar = alias(PhCalendarBlank);
export const CalendarCheck = alias(PhCalendarCheck);
export const CalendarDays = alias(PhCalendar);
export const Check = alias(PhCheck);
export const CheckCircle = alias(PhCheckCircle);
export const CheckCircle2 = alias(PhCheckCircle);
export const ChevronDown = alias(PhCaretDown);
export const ChevronLeft = alias(PhCaretLeft);
export const ChevronRight = alias(PhCaretRight);
export const ChevronUp = alias(PhCaretUp);
export const Circle = alias(PhCircle);
export const ClipboardList = alias(PhListChecks);
export const Clock = alias(PhClock);
export const Cloud = alias(PhCloudArrowUp);
export const Code = alias(PhCode);
export const Cpu = alias(PhCpu);
export const Dot = alias(PhDotOutline, "fill");
export const DollarSign = alias(PhCurrencyDollarSimple);
export const Download = alias(PhDownloadSimple);
export const Edit = alias(PhPencilSimple);
export const Edit2 = alias(PhPencilSimple);
export const Edit3 = alias(PhPencilSimple);
export const Eye = alias(PhEye);
export const EyeOff = alias(PhEyeSlash);
export const FileCheck = alias(PhFileText);
export const FileIcon = alias(PhFileText);
export const FileText = alias(PhFileText);
export const FileUp = alias(PhFileArrowUp);
export const FileWarning = alias(PhExam);
export const Filter = alias(PhListChecks);
export const Fingerprint = alias(PhFingerprint);
export const FolderUp = alias(PhFolderSimple);
export const Github = alias(PhGithubLogo);
export const Globe = alias(PhGlobeHemisphereWest);
export const GraduationCap = alias(PhGraduationCap);
export const GripVertical = alias(PhDotsThreeVertical);
export const KeyRound = alias(PhKey);
export const LayoutDashboard = alias(PhSquaresFour);
export const Linkedin = alias(PhLinkedinLogo);
export const Loader2 = alias(PhClockCountdown);
export const Lock = alias(PhLockSimple);
export const LogIn = alias(PhPassword);
export const Mail = alias(PhEnvelopeSimple);
export const MapPin = alias(PhMapPin);
export const Maximize = alias(PhArrowsOutSimple);
export const Megaphone = alias(PhPresentationChart);
export const Menu = alias(PhList);
export const MessageSquare = alias(PhChatCircleText);
export const MicOff = alias(PhMicrophoneSlash);
export const MonitorPlay = alias(PhMonitorPlay);
export const Moon = alias(PhMoon);
export const MoreHorizontal = alias(PhDotsThree);
export const MoreVertical = alias(PhDotsThreeVertical);
export const PanelLeft = alias(PhSidebarSimple);
export const Phone = alias(PhPhone);
export const Plus = alias(PhPlus);
export const RefreshCw = alias(PhClockCountdown);
export const Save = alias(PhFloppyDisk);
export const ScrollText = alias(PhNotepad);
export const Search = alias(PhMagnifyingGlass);
export const Send = alias(PhPaperPlaneTilt);
export const SendHorizontal = alias(PhPaperPlaneTilt);
export const Settings = alias(PhGear);
export const Share2 = alias(PhShareNetwork);
export const Shield = alias(PhShield);
export const ShieldAlert = alias(PhShieldWarning);
export const ShieldCheck = alias(PhSealCheck);
export const Sparkles = alias(PhSparkle);
export const Star = alias(PhStar);
export const Sun = alias(PhSun);
export const Target = alias(PhTarget);
export const Terminal = alias(PhTerminal);
export const ThumbsDown = alias(PhThumbsDown);
export const ThumbsUp = alias(PhThumbsUp);
export const Timer = alias(PhClockCountdown);
export const Trash2 = alias(PhTrashSimple);
export const TrendingDown = alias(PhTrendDown);
export const TrendingUp = alias(PhTrendUp);
export const Trophy = alias(PhTrophy);
export const Twitter = alias(PhTwitterLogo);
export const Upload = alias(PhUploadSimple);
export const User = alias(PhUser);
export const UserCheck = alias(PhUserCheck);
export const UserPlus = alias(PhUserPlus);
export const Users = alias(PhUsersThree);
export const Video = alias(PhVideoCamera);
export const X = alias(PhX);
export const XCircle = alias(PhXCircle);
export const Zap = alias(PhLightning);
export const ZoomIn = alias(PhMagnifyingGlass);

export default fallbackIcon;
