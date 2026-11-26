import { withApiLog } from "@/robin-api/log";
import { GET as one } from "@/robin-api/handlers/letter";

export const GET = withApiLog(one);
