import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { BodyParameters } from '../types';

export const loadVRM = async (file: File): Promise<VRM> => {
    const loader = new GLTFLoader();

    loader.register((parser: any) => new VRMLoaderPlugin(parser));

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);

        loader.load(
            url,
            (gltf) => {
                const vrm = gltf.userData.vrm;
                if (vrm) {
                    vrm.scene.rotation.y = Math.PI;
                    vrm.scene.updateMatrixWorld(true);
                    vrm.scene.traverse((object: any) => {
                        if ((object as THREE.Mesh).isMesh) {
                            const mesh = object as THREE.Mesh;

                            mesh.frustumCulled = false;

                            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

                            materials.forEach((mat: any) => {
                                if (mat.outlineWidthMode !== undefined) mat.outlineWidthMode = 'none';
                                if (mat.outlineWidth !== undefined) mat.outlineWidth = 0.0;
                                if (mat.userData && mat.userData.outlineWidthMode !== undefined) mat.userData.outlineWidthMode = 'none';

                                if (mat.uniforms) {
                                    const widthKeys = ['outlineWidth', '_OutlineWidth', 'OutlineWidth'];
                                    widthKeys.forEach(key => { if (mat.uniforms[key]) mat.uniforms[key].value = 0.0; });
                                    const modeKeys = ['outlineWidthMode', '_OutlineWidthMode', 'OutlineWidthMode'];
                                    modeKeys.forEach(key => { if (mat.uniforms[key]) mat.uniforms[key].value = 0; });
                                }
                                mat.needsUpdate = true;
                            });
                        }
                    });

                    const hips = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Hips);
                    const leftFoot = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.LeftFoot);

                    Object.values(VRMHumanBoneName).forEach(boneName => {
                        const node = vrm.humanoid?.getRawBoneNode(boneName);
                        if (node) {
                            node.userData.initialPosition = node.position.clone();
                            node.userData.initialScale = node.scale.clone();
                        }
                    });

                    if (hips) {
                        hips.userData.initialY = hips.position.y;
                        hips.userData.initialZ = hips.position.z;

                        if (leftFoot) {
                            const hipsWorldPos = hips.getWorldPosition(new THREE.Vector3());
                            const footWorldPos = leftFoot.getWorldPosition(new THREE.Vector3());
                            vrm.scene.userData.defaultLegLength = Math.abs(hipsWorldPos.y - footWorldPos.y);
                        } else {
                            vrm.scene.userData.defaultLegLength = 0.75;
                        }
                    }

                    if (vrm.meta) {
                        const meta = vrm.meta as any;

                        let isRestricted = false;

                        if (vrm.meta.metaVersion === '1') {
                            if (meta.modification === 'prohibited') isRestricted = true;
                        } else {
                            if (meta.licenseName) {
                                const lower = meta.licenseName.toLowerCase();
                                if (
                                    lower.includes("nd") ||
                                    lower.includes("no derivative") ||
                                    lower.includes("noderivative") ||
                                    meta.licenseName.includes("改変不可") ||
                                    meta.licenseName.includes("改変禁止") ||
                                    meta.licenseName.includes("禁止演绎") ||
                                    meta.licenseName.includes("禁止修改") ||
                                    meta.licenseName.includes("변경 금지") ||
                                    meta.licenseName.includes("수정 금지")
                                ) {
                                    isRestricted = true;
                                }
                            }
                        }

                        if (isRestricted) {
                            reject(new Error('modification_prohibited'));
                            URL.revokeObjectURL(url);
                            return;
                        }
                    }

                    resolve(vrm);
                } else {
                    reject(new Error('File is not a valid VRM.'));
                }
                URL.revokeObjectURL(url);
            },
            (progress) => {
                console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%');
            },
            (error) => {
                console.error(error);
                reject(error);
                URL.revokeObjectURL(url);
            }
        );
    });
};

const getBoneLengthAxis = (vrm: VRM, boneName: VRMHumanBoneName, childName: VRMHumanBoneName): 'x' | 'y' | 'z' => {
    const parent = vrm.humanoid.getRawBoneNode(boneName);
    const child = vrm.humanoid.getRawBoneNode(childName);
    if (!parent || !child) return 'y';
    const parentWorldPos = parent.getWorldPosition(new THREE.Vector3());
    const childWorldPos = child.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(childWorldPos, parentWorldPos);
    const parentWorldQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    dir.applyQuaternion(parentWorldQuat.invert());
    const x = Math.abs(dir.x);
    const y = Math.abs(dir.y);
    const z = Math.abs(dir.z);
    if (x > y && x > z) return 'x';
    if (z > x && z > y) return 'z';
    return 'y';
};

const updateColliderRadii = (vrm: VRM, headScale: number) => {
    if (!vrm.springBoneManager) return;

    const headNode = vrm.humanoid?.getRawBoneNode(VRMHumanBoneName.Head);

    vrm.springBoneManager.colliderGroups.forEach(group => {
        group.colliders.forEach(collider => {
            const node = (collider as unknown as THREE.Object3D).parent;
            if (!node) return;

            let isHeadCollider = false;

            if (headNode && (node === headNode || node.parent === headNode)) {
                isHeadCollider = true;
            }

            if (isHeadCollider) {
                if (collider.userData.originalRadius === undefined) {
                    const shape = collider.shape as any;
                    if (shape && shape.radius !== undefined) {
                        collider.userData.originalRadius = shape.radius;
                    }
                }

                if (collider.userData.originalRadius !== undefined) {
                    const shape = collider.shape as any;
                    shape.radius = collider.userData.originalRadius * headScale;
                }
            }
        });
    });
};

export const applyBodyParameters = (vrm: VRM, params: BodyParameters) => {
    if (!vrm.humanoid) return;

    Object.values(VRMHumanBoneName).forEach((boneName) => {
        const node = vrm.humanoid?.getRawBoneNode(boneName);
        if (node) {
            node.scale.set(1, 1, 1);
        }
    });


    const hasUpperChest = !!vrm.humanoid.getRawBoneNode(VRMHumanBoneName.UpperChest);
    const chestBone = hasUpperChest ? VRMHumanBoneName.UpperChest : VRMHumanBoneName.Chest;
    const desiredScales: Partial<Record<VRMHumanBoneName, THREE.Vector3>> = {};

    const setDesired = (bone: VRMHumanBoneName, x: number, y: number, z: number) => {
        desiredScales[bone] = new THREE.Vector3(x, y, z);
    };

    type SymmetricBoneGroup = 'Shoulder' | 'UpperArm' | 'LowerArm' | 'Hand' | 'UpperLeg' | 'LowerLeg' | 'Foot' | 'Toes';

    const setSymmetricDesired = (groupName: SymmetricBoneGroup, length: number, thickness: number) => {
        const map: Record<SymmetricBoneGroup, { bones: VRMHumanBoneName[], childForAxis?: VRMHumanBoneName }> = {
            'Shoulder': { bones: [VRMHumanBoneName.LeftShoulder, VRMHumanBoneName.RightShoulder] },
            'UpperArm': { bones: [VRMHumanBoneName.LeftUpperArm, VRMHumanBoneName.RightUpperArm], childForAxis: VRMHumanBoneName.LeftLowerArm },
            'LowerArm': { bones: [VRMHumanBoneName.LeftLowerArm, VRMHumanBoneName.RightLowerArm], childForAxis: VRMHumanBoneName.LeftHand },
            'Hand': { bones: [VRMHumanBoneName.LeftHand, VRMHumanBoneName.RightHand] },
            'UpperLeg': { bones: [VRMHumanBoneName.LeftUpperLeg, VRMHumanBoneName.RightUpperLeg], childForAxis: VRMHumanBoneName.LeftLowerLeg },
            'LowerLeg': { bones: [VRMHumanBoneName.LeftLowerLeg, VRMHumanBoneName.RightLowerLeg], childForAxis: VRMHumanBoneName.LeftFoot },
            'Foot': { bones: [VRMHumanBoneName.LeftFoot, VRMHumanBoneName.RightFoot] },
            'Toes': { bones: [VRMHumanBoneName.LeftToes, VRMHumanBoneName.RightToes] },
        };

        const entry = map[groupName];
        if (entry) {
            let axis = 'y';
            if (entry.childForAxis) {
                axis = getBoneLengthAxis(vrm, entry.bones[0], entry.childForAxis);
            }

            entry.bones.forEach((boneName) => {
                if (groupName === 'Hand' || groupName === 'Foot' || groupName === 'Toes' || groupName === 'Shoulder') {
                    if (groupName === 'Shoulder') {
                        setDesired(boneName, 1.0, 1.0, 1.0);
                    } else {
                        setDesired(boneName, length, length, length);
                    }
                } else {
                    let x, y, z;
                    if (axis === 'x') {
                        x = length; y = thickness; z = thickness;
                    } else if (axis === 'z') {
                        x = thickness; y = thickness; z = length;
                    } else {
                        x = thickness; y = length; z = thickness;
                    }
                    setDesired(boneName, x, y, z);
                }
            });
        }
    };

    setDesired(VRMHumanBoneName.Hips, params.waistWidth, 1.0, params.hipSize);
    setDesired(VRMHumanBoneName.Spine, params.stomachSize, params.torsoHeight, params.stomachSize);

    const chestWidth = params.shoulderWidth;

    if (hasUpperChest) {
        setDesired(VRMHumanBoneName.Chest, chestWidth, 1.0, params.stomachSize);
        setDesired(VRMHumanBoneName.UpperChest, chestWidth, 1.0, params.chestSize);
    } else {
        setDesired(VRMHumanBoneName.Chest, chestWidth, 1.0, params.chestSize);
    }

    setDesired(VRMHumanBoneName.Neck, params.neckWidth, params.neckHeight, params.neckWidth);
    setDesired(VRMHumanBoneName.Head, params.headSize, params.headSize, params.headSize);

    setSymmetricDesired('Shoulder', 1.0, 1.0);
    setSymmetricDesired('UpperArm', params.armLength, params.armMuscle);
    setSymmetricDesired('LowerArm', params.armLength, params.forearmSize);
    setSymmetricDesired('Hand', params.handSize, 0);
    setSymmetricDesired('UpperLeg', params.legLength, params.thighSize);
    setSymmetricDesired('LowerLeg', params.legLength, params.calfSize);
    setSymmetricDesired('Foot', params.footSize, 0);
    setSymmetricDesired('Toes', params.toeSize, 0);

    const applyParams = (boneName: VRMHumanBoneName, parentName: VRMHumanBoneName | null) => {
        const node = vrm.humanoid?.getRawBoneNode(boneName);
        if (!node) return;

        if (node.userData.initialZ === undefined) node.userData.initialZ = node.position.z;
        if (node.userData.initialY === undefined) node.userData.initialY = node.position.y;

        if (boneName === VRMHumanBoneName.Hips) {
            const zOffset = (params.hipSize - 1.0) * -0.22;
            node.position.z = node.userData.initialZ + zOffset;
            node.position.y = node.userData.initialY;

            updateRootPosition(vrm, params, node);
        }

        const isChestTarget = hasUpperChest
            ? (boneName === VRMHumanBoneName.UpperChest)
            : (boneName === VRMHumanBoneName.Chest);

        if (isChestTarget) {
            const zOffset = (params.chestSize - 1.0) * -0.05;
            node.position.z = node.userData.initialZ + zOffset;
        }

        const currentDesired = desiredScales[boneName] || new THREE.Vector3(1, 1, 1);
        let parentDesired = new THREE.Vector3(1, 1, 1);
        if (parentName && desiredScales[parentName]) {
            parentDesired = desiredScales[parentName]!.clone();
        }

        const childBonesToProtect: Partial<Record<VRMHumanBoneName, VRMHumanBoneName>> = {
            [VRMHumanBoneName.LeftLowerArm]: VRMHumanBoneName.LeftUpperArm,
            [VRMHumanBoneName.LeftHand]: VRMHumanBoneName.LeftLowerArm,
            [VRMHumanBoneName.RightLowerArm]: VRMHumanBoneName.RightUpperArm,
            [VRMHumanBoneName.RightHand]: VRMHumanBoneName.RightLowerArm,
            [VRMHumanBoneName.LeftLowerLeg]: VRMHumanBoneName.LeftUpperLeg,
            [VRMHumanBoneName.LeftFoot]: VRMHumanBoneName.LeftLowerLeg,
            [VRMHumanBoneName.RightLowerLeg]: VRMHumanBoneName.RightUpperLeg,
            [VRMHumanBoneName.RightFoot]: VRMHumanBoneName.RightLowerLeg,
            [VRMHumanBoneName.LeftUpperLeg]: VRMHumanBoneName.Hips,
            [VRMHumanBoneName.RightUpperLeg]: VRMHumanBoneName.Hips,

            [VRMHumanBoneName.Spine]: VRMHumanBoneName.Hips,
            [VRMHumanBoneName.Chest]: VRMHumanBoneName.Spine,
            [VRMHumanBoneName.Neck]: chestBone,
            [VRMHumanBoneName.Head]: VRMHumanBoneName.Neck,

            [VRMHumanBoneName.LeftShoulder]: chestBone,
            [VRMHumanBoneName.RightShoulder]: chestBone,
            [VRMHumanBoneName.LeftUpperArm]: VRMHumanBoneName.LeftShoulder,
            [VRMHumanBoneName.RightUpperArm]: VRMHumanBoneName.RightShoulder,
        };

        if (hasUpperChest) {
            childBonesToProtect[VRMHumanBoneName.UpperChest] = VRMHumanBoneName.Chest;
        }

        const parentNameForInverse = childBonesToProtect[boneName];

        if (parentNameForInverse) {
            node.scale.copy(currentDesired);
        } else {
            const safeDiv = (a: number, b: number) => b === 0 ? 1 : a / b;
            const scaleX = safeDiv(currentDesired.x, parentDesired.x);
            const scaleY = safeDiv(currentDesired.y, parentDesired.y);
            const scaleZ = safeDiv(currentDesired.z, parentDesired.z);
            node.scale.set(scaleX, scaleY, scaleZ);
        }

        if (parentNameForInverse) {
            const parentNode = vrm.humanoid?.getRawBoneNode(parentNameForInverse);
            if (parentNode) {
                const ensureInverseScaleGroup = (parent: THREE.Object3D, child: THREE.Object3D) => {
                    if (child.parent !== parent) {
                        if (child.parent && child.parent.userData.isInverseScaleGroup && child.parent.parent === parent) {
                            return child.parent;
                        }
                    }
                    const group = new THREE.Group();
                    group.name = `InverseScale_${child.name}`;
                    group.userData.isInverseScaleGroup = true;
                    parent.add(group);
                    group.add(child);
                    return group;
                };

                const group = ensureInverseScaleGroup(parentNode, node);

                group.scale.set(
                    parentNode.scale.x === 0 ? 1 : 1 / parentNode.scale.x,
                    parentNode.scale.y === 0 ? 1 : 1 / parentNode.scale.y,
                    parentNode.scale.z === 0 ? 1 : 1 / parentNode.scale.z
                );

                if (node.userData.initialPosition) {
                    node.position.copy(node.userData.initialPosition).multiply(parentNode.scale);
                }
            }
        }
    };

    applyParams(VRMHumanBoneName.Hips, null);
    applyParams(VRMHumanBoneName.Spine, VRMHumanBoneName.Hips);
    applyParams(VRMHumanBoneName.Chest, VRMHumanBoneName.Spine);
    if (hasUpperChest) {
        applyParams(VRMHumanBoneName.UpperChest, VRMHumanBoneName.Chest);
    }

    applyParams(VRMHumanBoneName.Neck, chestBone);
    applyParams(VRMHumanBoneName.Head, VRMHumanBoneName.Neck);

    applyParams(VRMHumanBoneName.LeftShoulder, chestBone);
    applyParams(VRMHumanBoneName.LeftUpperArm, VRMHumanBoneName.LeftShoulder);
    applyParams(VRMHumanBoneName.LeftLowerArm, VRMHumanBoneName.LeftUpperArm);
    applyParams(VRMHumanBoneName.LeftHand, VRMHumanBoneName.LeftLowerArm);

    applyParams(VRMHumanBoneName.RightShoulder, chestBone);
    applyParams(VRMHumanBoneName.RightUpperArm, VRMHumanBoneName.RightShoulder);
    applyParams(VRMHumanBoneName.RightLowerArm, VRMHumanBoneName.RightUpperArm);
    applyParams(VRMHumanBoneName.RightHand, VRMHumanBoneName.RightLowerArm);

    applyParams(VRMHumanBoneName.LeftUpperLeg, VRMHumanBoneName.Hips);
    applyParams(VRMHumanBoneName.LeftLowerLeg, VRMHumanBoneName.LeftUpperLeg);
    applyParams(VRMHumanBoneName.LeftFoot, VRMHumanBoneName.LeftLowerLeg);
    applyParams(VRMHumanBoneName.LeftToes, VRMHumanBoneName.LeftFoot);

    applyParams(VRMHumanBoneName.RightUpperLeg, VRMHumanBoneName.Hips);
    applyParams(VRMHumanBoneName.RightLowerLeg, VRMHumanBoneName.RightUpperLeg);
    applyParams(VRMHumanBoneName.RightFoot, VRMHumanBoneName.RightLowerLeg);
    applyParams(VRMHumanBoneName.RightToes, VRMHumanBoneName.RightFoot);

    const fingers = [
        [VRMHumanBoneName.LeftThumbProximal, VRMHumanBoneName.LeftHand],
        [VRMHumanBoneName.LeftIndexProximal, VRMHumanBoneName.LeftHand],
        [VRMHumanBoneName.LeftMiddleProximal, VRMHumanBoneName.LeftHand],
        [VRMHumanBoneName.LeftRingProximal, VRMHumanBoneName.LeftHand],
        [VRMHumanBoneName.LeftLittleProximal, VRMHumanBoneName.LeftHand],
        [VRMHumanBoneName.RightThumbProximal, VRMHumanBoneName.RightHand],
        [VRMHumanBoneName.RightIndexProximal, VRMHumanBoneName.RightHand],
        [VRMHumanBoneName.RightMiddleProximal, VRMHumanBoneName.RightHand],
        [VRMHumanBoneName.RightRingProximal, VRMHumanBoneName.RightHand],
        [VRMHumanBoneName.RightLittleProximal, VRMHumanBoneName.RightHand],
    ];

    fingers.forEach(([finger, parent]) => {
        setDesired(finger as VRMHumanBoneName, params.fingerSize, params.fingerSize, params.fingerSize);
        applyParams(finger as VRMHumanBoneName, parent as VRMHumanBoneName);
    });

    updateColliderRadii(vrm, params.headSize);

    vrm.scene.updateMatrixWorld(true);
};

export const updateRootPosition = (vrm: VRM, params: BodyParameters, hipsNode?: THREE.Object3D) => {
    const node = hipsNode || vrm.humanoid?.getRawBoneNode(VRMHumanBoneName.Hips);
    if (!node) return;

    const defaultLegLength = vrm.scene.userData.defaultLegLength || 0.75;
    const footBaseHeight = 0.11;
    const legGrowth = (params.legLength - 1.0) * defaultLegLength;
    const footGrowth = (params.footSize - 1.0) * footBaseHeight;

    const hipsQuat = new THREE.Quaternion();
    node.getWorldQuaternion(hipsQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hipsQuat).normalize();

    vrm.scene.position.copy(up.multiplyScalar(legGrowth + footGrowth));
};
