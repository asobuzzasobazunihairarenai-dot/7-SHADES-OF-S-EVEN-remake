// ユーザー要望「右上のオプションエリアにDiscordアイコンを追加してください。それを押すと
// 公式Discordが新しいタブで開きます。ヘルプマークの左隣に追加し、残金表示をその分左に
// ずらしてください」（続き63）。#help-button・#my-page-buttonと同じ「アイコンのみ、
// 丸い縁取り無し」の見た目・同じbuildIconButtonContent/wireIconButtonClickパターン。

import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getOptionArea } from "./option-area.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

const DISCORD_INVITE_URL = "https://discord.gg/stP78fswKx";

export function initDiscordLink() {
  const btn = document.createElement("button");
  btn.id = "discord-link-button";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/discord.svg",
    tooltip: t("dl.tip"),
  });
  captionEl.textContent = "Discord";
  wireIconButtonClick(btn, {
    detailTitle: t("dl.title"),
    detailParagraphs: [t("dl.detail")],
    onAction: () => {
      window.open(DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
    },
  });
  getOptionArea().appendChild(btn);
}
