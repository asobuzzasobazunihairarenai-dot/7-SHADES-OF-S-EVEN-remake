// ユーザー要望「右上のオプションエリアにDiscordアイコンを追加してください。それを押すと
// 公式Discordが新しいタブで開きます。ヘルプマークの左隣に追加し、残金表示をその分左に
// ずらしてください」（続き63）。#help-button・#my-page-buttonと同じ「アイコンのみ、
// 丸い縁取り無し」の見た目・同じbuildIconButtonContent/wireIconButtonClickパターン。

import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getOptionArea } from "./option-area.js";

const DISCORD_INVITE_URL = "https://discord.gg/stP78fswKx";

export function initDiscordLink() {
  const btn = document.createElement("button");
  btn.id = "discord-link-button";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/discord.svg",
    tooltip: "公式Discordを新しいタブで開きます",
  });
  captionEl.textContent = "Discord";
  wireIconButtonClick(btn, {
    detailTitle: "公式Discord",
    detailParagraphs: ["公式Discordサーバーを新しいタブで開きます。"],
    onAction: () => {
      window.open(DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
    },
  });
  getOptionArea().appendChild(btn);
}
