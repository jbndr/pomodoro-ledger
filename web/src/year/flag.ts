import { flagOn } from "../lib/flags";

export const yearEnabled = () => flagOn(import.meta.env.VITE_YEAR_IN_FOCUS, Date.now());
