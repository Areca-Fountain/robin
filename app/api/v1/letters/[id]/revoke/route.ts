import { withApiLog } from "@/robin-api/log";
import { POST as revoke } from "@/robin-api/handlers/revoke";

export const POST = withApiLog(revoke);
