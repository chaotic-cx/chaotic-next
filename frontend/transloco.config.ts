const config = {
  rootTranslationsPath: 'frontend/public/i18n/',
  langs: ['en', 'de'],
  keysManager: {
    input: ['frontend/src/app'],
    output: 'frontend/public/i18n',
    unflat: true,
    sort: true,
  },
};

export default config;
