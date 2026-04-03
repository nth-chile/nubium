import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import {
  tabConfig,
  fullScoreConfig,
} from "../../views/ViewMode";

export const ViewsPlugin: NotationPlugin = {
  id: "notation.views",
  name: "View Modes",
  version: "1.0.0",
  description: "Full Score and Tab view modes",

  activate(api: PluginAPI) {
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
