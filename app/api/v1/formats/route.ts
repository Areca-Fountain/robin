import { withApiLog } from "@/robin-api/log";
import { GET as formats } from "@/robin-api/handlers/formats";

export const GET = withApiLog(formats);
