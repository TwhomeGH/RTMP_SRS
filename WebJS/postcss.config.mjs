import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import mediaMinmax from 'postcss-media-minmax';
import postcssPresetEnv from 'postcss-preset-env';
import postcssNested from 'postcss-nested';

import discardEmpty from 'postcss-discard-empty';

export default {
  plugins: [
    tailwindcss(),           // ✅ 必須呼叫函數
    autoprefixer(),
    postcssNested(),
    mediaMinmax(),

    postcssPresetEnv({ stage: 0 }),
    discardEmpty(),         // ✅ 必須呼叫函數

  ],
};