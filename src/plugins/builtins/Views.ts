import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import {
  songwriterConfig,
  leadSheetConfig,
  tabConfig,
  fullScoreConfig,
} from "../../views/ViewMode";

export const ViewsPlugin: NotationPlugin = {
  id: "notation.views",
  name: "View Modes",
  version: "1.0.0",
  description: "Songwriter, Lead Sheet, Tab, and Full Score view modes",

  activate(api: PluginAPI) {
    api.registerView("view.songwriter", {
      name: "Songwriter",
      icon: "\u266B",
      getViewConfig: songwriterConfig,
    });

    api.registerView("view.lead-sheet", {
      name: "Lead Sheet",
      icon: "\u266A",
      getViewConfig: leadSheetConfig,
    });

    api.registerView("view.tab", {
      name: "Tab",
      icon: "TAB",
      getViewConfig: tabConfig,
    });

    api.registerView("view.full-score", {
      name: "Full Score",
      icon: "\uD834\uDD1E",
      getViewConfig: fullScoreConfig,
    });
  },
};
