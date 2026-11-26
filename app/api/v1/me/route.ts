import { withApiLog } from "@/robin-api/log";
import { GET as me } from "@/robin-api/handlers/me";

export const GET = withApiLog(me);
