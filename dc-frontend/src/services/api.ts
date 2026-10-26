import { isMock } from '@/config/env';
import { mockApi } from './mockApi';
import { httpApi } from './httpApi';
import type { ApiClient } from './types';

/** The single entry point every page uses. Mock and API modes share one interface. */
export const api: ApiClient = isMock ? mockApi : httpApi;

export { ApiError, errorMessage } from './types';
