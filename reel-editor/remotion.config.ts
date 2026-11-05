// Config for the CLI (studio / render / still). The Node scripts in pipeline/ pass options directly.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// 8 tabs race in the compositor ("No frame found at position") on long talking-head sources; 4 is stable.
Config.setConcurrency(4);
