// Every test file starts on its own in-memory database (DB/schema applied) with the Node platform.
import { resetConfig } from '@core/server/config';
import { freshStore } from './config';

freshStore();
resetConfig();
