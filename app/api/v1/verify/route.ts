import { withApiLog } from "@/robin-api/log";
import { POST as verify } from "@/robin-api/handlers/verify";

export const POST = withApiLog(verify);
