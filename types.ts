export interface BodyParameters {
  headSize: number;
  neckWidth: number;
  neckHeight: number;
  shoulderWidth: number;
  chestSize: number;
  armLength: number;
  armMuscle: number;
  forearmSize: number;
  handSize: number;
  fingerSize: number;
  stomachSize: number;
  torsoHeight: number;
  waistWidth: number;
  hipSize: number;
  legLength: number;
  thighSize: number;
  calfSize: number;
  footSize: number;
  toeSize: number;

  expNeutral: number;
  expHappy: number;
  expAngry: number;
  expSad: number;
  expRelaxed: number;
  expSurprised: number;
  expAa: number;
  expIh: number;
  expOu: number;
  expEe: number;
  expOh: number;
  expBlink: number;
  expBlinkLeft: number;
  expBlinkRight: number;
  expLookUp: number;
  expLookDown: number;
  expLookLeft: number;
  expLookRight: number;
  customExpressions?: Record<string, number>;
}

export type BoneTransforms = Record<string, {
  rotation: { x: number; y: number; z: number; w: number };
  position?: { x: number; y: number; z: number };
}>;

export const DEFAULT_PARAMETERS: BodyParameters = {
  headSize: 1.0,
  neckWidth: 1.0,
  neckHeight: 1.0,
  shoulderWidth: 1.0,
  chestSize: 1.0,
  armLength: 1.0,
  armMuscle: 1.0,
  forearmSize: 1.0,
  handSize: 1.0,
  fingerSize: 1.0,
  stomachSize: 1.0,
  torsoHeight: 1.0,
  waistWidth: 1.0,
  hipSize: 1.0,
  legLength: 1.0,
  thighSize: 1.0,
  calfSize: 1.0,
  footSize: 1.0,
  toeSize: 1.0,

  expNeutral: 0.0,
  expHappy: 0.0,
  expAngry: 0.0,
  expSad: 0.0,
  expRelaxed: 0.0,
  expSurprised: 0.0,
  expAa: 0.0,
  expIh: 0.0,
  expOu: 0.0,
  expEe: 0.0,
  expOh: 0.0,
  expBlink: 0.0,
  expBlinkLeft: 0.0,
  expBlinkRight: 0.0,
  expLookUp: 0.0,
  expLookDown: 0.0,
  expLookLeft: 0.0,
  expLookRight: 0.0,
  customExpressions: {},
};