
import { PageVisibilityState, NetworkQuality } from "../types/resumption.types";

export interface HeartbeatDto {
    clientReportedRemainingSeconds: number;
    pageVisibility: PageVisibilityState;
    networkQuality: NetworkQuality;
}
