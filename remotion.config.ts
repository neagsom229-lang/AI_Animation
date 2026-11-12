/**
 * Remotion CLI configuration.
 * Doc: https://www.remotion.dev/docs/config
 */
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('./remotion/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setOverwriteOutput(true);
