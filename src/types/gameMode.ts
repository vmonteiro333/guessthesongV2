export type GameModeId = "classic" | "blitz" | "hardcore" | "daily";

export interface GameMode {
  id: GameModeId;
  name: string;
  description: string;
  status: "available" | "soon";
}