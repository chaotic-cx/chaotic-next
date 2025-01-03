import { InjectionToken } from '@angular/core';
import { EnvironmentModel } from './environment.model';

export const APP_CONFIG = new InjectionToken<EnvironmentModel>('Application config');
