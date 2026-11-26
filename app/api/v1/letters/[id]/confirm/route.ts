import { withApiLog } from "@/robin-api/log";
import { POST as confirm } from "@/robin-api/handlers/confirm";

export const POST = withApiLog(confirm);
