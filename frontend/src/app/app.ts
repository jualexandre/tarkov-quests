import { Component } from "@angular/core";
import { QuestsPageComponent } from "./features/quests/quests-page/quests-page.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [QuestsPageComponent],
  templateUrl: "./app.html",
})
export class App {}
