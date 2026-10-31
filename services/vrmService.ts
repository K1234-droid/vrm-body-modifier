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
                    if (vrm.meta?.metaVersion === '1') {
                        vrm.scene.rotation.y = 0;
                    } else {
                        vrm.scene.rotation.y = Math.PI;
                    }
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
                            const error = new Error('modification_prohibited');
                            (error as any).detail = {
                                version: vrm.meta.metaVersion,
                                value: vrm.meta.metaVersion === '1' ? meta.modification : meta.licenseName
                            };
                            reject(error);
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

const applyFrontChestDeformation = (vrm: VRM, chestBoneName: VRMHumanBoneName, chestSize: number) => {
    const chestBone = vrm.humanoid?.getRawBoneNode(chestBoneName);
    if (!chestBone) return;

    // loadVRM normalizes both VRM versions so the avatar's front faces world +Z.
    const frontWorld = new THREE.Vector3(0, 0, 1);
    const frontInBone = frontWorld
        .applyQuaternion(chestBone.getWorldQuaternion(new THREE.Quaternion()).invert())
        .normalize();
    const upInBone = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(chestBone.getWorldQuaternion(new THREE.Quaternion()).invert())
        .normalize();
    const sideInBone = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(chestBone.getWorldQuaternion(new THREE.Quaternion()).invert())
        .normalize();

    vrm.scene.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh || !mesh.skeleton) return;

        let deformation = mesh.userData.frontChestDeformation;
        if (!deformation) {
            const position = mesh.geometry.getAttribute('position');
            const skinIndex = mesh.geometry.getAttribute('skinIndex');
            const skinWeight = mesh.geometry.getAttribute('skinWeight');
            const chestIndex = mesh.skeleton.bones.indexOf(chestBone as THREE.Bone);
            if (!position || !skinIndex || !skinWeight || chestIndex < 0) return;

            // Work in the chest bone's bind space so the front/back mask follows
            // the model's own orientation and bone layout.
            const meshToBone = new THREE.Matrix4()
                .multiplyMatrices(mesh.skeleton.boneInverses[chestIndex], mesh.bindMatrix);
            const boneToMesh = meshToBone.clone().invert();
            const meshFront = frontInBone.clone().transformDirection(boneToMesh);
            const original = new Float32Array(position.count * 3);
            const vertexWeights = new Float32Array(position.count);
            const projections = new Float32Array(position.count);
            const heights = new Float32Array(position.count);
            const sides = new Float32Array(position.count);
            const vertex = new THREE.Vector3();
            let rearProjection = Number.POSITIVE_INFINITY;
            let frontProjection = Number.NEGATIVE_INFINITY;

            for (let i = 0; i < position.count; i++) {
                original[i * 3] = position.getX(i);
                original[i * 3 + 1] = position.getY(i);
                original[i * 3 + 2] = position.getZ(i);
                let chestWeight = 0;
                for (let j = 0; j < 4; j++) {
                    if (skinIndex.getComponent(i, j) === chestIndex) {
                        chestWeight += skinWeight.getComponent(i, j);
                    }
                }
                vertex.fromBufferAttribute(position, i).applyMatrix4(meshToBone);
                const projection = vertex.dot(frontInBone);
                vertexWeights[i] = chestWeight;
                projections[i] = projection;
                heights[i] = vertex.dot(upInBone);
                sides[i] = vertex.dot(sideInBone);
                if (chestWeight > 0.05) {
                    rearProjection = Math.min(rearProjection, projection);
                    frontProjection = Math.max(frontProjection, projection);
                }
            }

            if (!Number.isFinite(rearProjection) || frontProjection <= rearProjection) return;

            const frontRegionStart = rearProjection + (frontProjection - rearProjection) * 0.3;
            let lowerChestHeight = Number.POSITIVE_INFINITY;
            let upperChestHeight = Number.NEGATIVE_INFINITY;
            let leftChestSide = Number.POSITIVE_INFINITY;
            let rightChestSide = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < position.count; i++) {
                if (vertexWeights[i] > 0.05 && projections[i] >= frontRegionStart) {
                    lowerChestHeight = Math.min(lowerChestHeight, heights[i]);
                    upperChestHeight = Math.max(upperChestHeight, heights[i]);
                    leftChestSide = Math.min(leftChestSide, sides[i]);
                    rightChestSide = Math.max(rightChestSide, sides[i]);
                }
            }
            if (!Number.isFinite(lowerChestHeight) || upperChestHeight <= lowerChestHeight || rightChestSide <= leftChestSide) return;

            // Smooth the chest influence across neighboring vertices. VRM
            // skin weights can change sharply at a bone boundary, which would
            // otherwise leave a visibly jagged deformation line.
            const vertexGroups = new Int32Array(position.count);
            const groupByPosition = new Map<string, number>();
            const groupSums: number[] = [];
            const groupCounts: number[] = [];
            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i);
                const y = position.getY(i);
                const z = position.getZ(i);
                const key = `${Math.round(x * 10000)},${Math.round(y * 10000)},${Math.round(z * 10000)}`;
                let group = groupByPosition.get(key);
                if (group === undefined) {
                    group = groupSums.length;
                    groupByPosition.set(key, group);
                    groupSums.push(0);
                    groupCounts.push(0);
                }
                vertexGroups[i] = group;
                groupSums[group] += vertexWeights[i];
                groupCounts[group]++;
            }

            const neighbors = Array.from({ length: groupSums.length }, () => new Set<number>());
            const triangleIndices = mesh.geometry.index?.array;
            const triangleCount = triangleIndices ? triangleIndices.length : position.count;
            for (let i = 0; i + 2 < triangleCount; i += 3) {
                const a = vertexGroups[triangleIndices ? triangleIndices[i] : i];
                const b = vertexGroups[triangleIndices ? triangleIndices[i + 1] : i + 1];
                const c = vertexGroups[triangleIndices ? triangleIndices[i + 2] : i + 2];
                if (a === b || b === c || c === a) continue;
                neighbors[a].add(b); neighbors[a].add(c);
                neighbors[b].add(a); neighbors[b].add(c);
                neighbors[c].add(a); neighbors[c].add(b);
            }

            let smoothedWeights = groupSums.map((sum, i) => sum / groupCounts[i]);
            for (let pass = 0; pass < 3; pass++) {
                smoothedWeights = smoothedWeights.map((weight, i) => {
                    if (neighbors[i].size === 0) return weight;
                    let neighborAverage = 0;
                    neighbors[i].forEach((neighbor) => { neighborAverage += smoothedWeights[neighbor]; });
                    neighborAverage /= neighbors[i].size;
                    return weight * 0.5 + neighborAverage * 0.5;
                });
            }
            for (let i = 0; i < position.count; i++) {
                vertexWeights[i] = smoothedWeights[vertexGroups[i]];
            }

            deformation = {
                original,
                vertexWeights,
                projections,
                heights,
                sides,
                rearProjection,
                lowerChestHeight,
                upperChestHeight,
                chestCenterSide: (leftChestSide + rightChestSide) * 0.5,
                chestHalfWidth: (rightChestSide - leftChestSide) * 0.5,
                depthRange: frontProjection - rearProjection,
                direction: meshFront,
            };
            // Keep a private geometry copy so shared meshes are not deformed together.
            mesh.geometry = mesh.geometry.clone();
            mesh.userData.frontChestDeformation = deformation;
        }

        const position = mesh.geometry.getAttribute('position');
        if (!position) return;
        const {
            original, vertexWeights, projections, heights, sides, rearProjection,
            lowerChestHeight, upperChestHeight, chestCenterSide, chestHalfWidth,
            depthRange, direction,
        } = deformation;
        const chestDelta = chestSize - 1;
        const lowerFadeStart = lowerChestHeight + (upperChestHeight - lowerChestHeight) * 0.16;
        const lowerFadeEnd = lowerChestHeight + (upperChestHeight - lowerChestHeight) * 0.44;
        const upperFadeStart = lowerChestHeight + (upperChestHeight - lowerChestHeight) * 0.64;
        const upperFadeEnd = lowerChestHeight + (upperChestHeight - lowerChestHeight) * 0.84;
        const frontCenter = rearProjection + depthRange * 0.84;
        const frontRadius = depthRange * 0.32;

        for (let i = 0; i < position.count; i++) {
            const offset = i * 3;
            // Reach full influence early so variations in ordinary chest skin
            // weights do not create small dents across the front surface.
            const rawWeight = THREE.MathUtils.clamp((vertexWeights[i] - 0.02) / 0.18, 0, 1);
            const weight = rawWeight * rawWeight * (3 - 2 * rawWeight);
            const heightT = THREE.MathUtils.clamp((heights[i] - lowerFadeStart) / (lowerFadeEnd - lowerFadeStart), 0, 1);
            const lowerMask = heightT * heightT * (3 - 2 * heightT);
            const upperT = THREE.MathUtils.clamp((heights[i] - upperFadeStart) / (upperFadeEnd - upperFadeStart), 0, 1);
            const upperMask = 1 - upperT * upperT * (3 - 2 * upperT);
            const frontDistance = (projections[i] - frontCenter) / frontRadius;
            const frontMask = Math.exp(-0.5 * frontDistance * frontDistance);
            // Favor two broad chest lobes over the centerline, with a soft
            // outer fade before the shoulders and arms. Gaussian profiles
            // make the plan-view contour oval instead of pointed.
            const sideRatio = Math.abs(sides[i] - chestCenterSide) / chestHalfWidth;
            const lobeDistance = (sideRatio - 0.36) / 0.25;
            const lobeMask = Math.exp(-0.5 * lobeDistance * lobeDistance);
            const outerT = THREE.MathUtils.clamp((sideRatio - 0.84) / 0.22, 0, 1);
            const outerMask = 1 - outerT * outerT * (3 - 2 * outerT);
            const sideMask = lobeMask * outerMask;
            // Use a rounded front-only bulge with soft side and height fades.
            // This keeps the lower torso and shoulders still and avoids a
            // linear wedge when the model is viewed from either side.
            const displacement = depthRange * 0.55 * chestDelta * weight * lowerMask * upperMask * frontMask * sideMask;
            position.setXYZ(
                i,
                original[offset] + direction.x * displacement,
                original[offset + 1] + direction.y * displacement,
                original[offset + 2] + direction.z * displacement,
            );
        }
        position.needsUpdate = true;
        // Recomputing normals on non-indexed meshes makes every triangle look
        // flat, so keep the model's authored normals in that common VRM case.
        if (mesh.geometry.index) mesh.geometry.computeVertexNormals();
    });
};

const applyRearHipDeformation = (vrm: VRM, hipSize: number) => {
    const hipBone = vrm.humanoid?.getRawBoneNode(VRMHumanBoneName.Hips);
    if (!hipBone) return;

    const boneRotation = hipBone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const backInBone = new THREE.Vector3(0, 0, -1).applyQuaternion(boneRotation).normalize();
    const upInBone = new THREE.Vector3(0, 1, 0).applyQuaternion(boneRotation).normalize();
    const sideInBone = new THREE.Vector3(1, 0, 0).applyQuaternion(boneRotation).normalize();

    vrm.scene.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh || !mesh.skeleton) return;

        const priorFrontDeformation = mesh.userData.frontChestDeformation || mesh.userData.frontStomachDeformation;
        let deformation = mesh.userData.rearHipDeformation;
        if (!deformation) {
            const position = mesh.geometry.getAttribute('position');
            const skinIndex = mesh.geometry.getAttribute('skinIndex');
            const skinWeight = mesh.geometry.getAttribute('skinWeight');
            const hipIndex = mesh.skeleton.bones.indexOf(hipBone as THREE.Bone);
            if (!position || !skinIndex || !skinWeight || hipIndex < 0) return;

            const original = priorFrontDeformation?.original || (() => {
                const values = new Float32Array(position.count * 3);
                for (let i = 0; i < position.count; i++) {
                    values[i * 3] = position.getX(i);
                    values[i * 3 + 1] = position.getY(i);
                    values[i * 3 + 2] = position.getZ(i);
                }
                return values;
            })();

            const meshToBone = new THREE.Matrix4()
                .multiplyMatrices(mesh.skeleton.boneInverses[hipIndex], mesh.bindMatrix);
            const boneToMesh = meshToBone.clone().invert();
            const meshBack = backInBone.clone().transformDirection(boneToMesh);
            const weights = new Float32Array(position.count);
            const projections = new Float32Array(position.count);
            const heights = new Float32Array(position.count);
            const sides = new Float32Array(position.count);
            const vertex = new THREE.Vector3();
            let frontProjection = Number.POSITIVE_INFINITY;
            let rearProjection = Number.NEGATIVE_INFINITY;

            for (let i = 0; i < position.count; i++) {
                let hipWeight = 0;
                for (let j = 0; j < 4; j++) {
                    if (skinIndex.getComponent(i, j) === hipIndex) hipWeight += skinWeight.getComponent(i, j);
                }
                vertex.set(original[i * 3], original[i * 3 + 1], original[i * 3 + 2]).applyMatrix4(meshToBone);
                weights[i] = hipWeight;
                projections[i] = vertex.dot(backInBone);
                heights[i] = vertex.dot(upInBone);
                sides[i] = vertex.dot(sideInBone);
                if (hipWeight > 0.05) {
                    frontProjection = Math.min(frontProjection, projections[i]);
                    rearProjection = Math.max(rearProjection, projections[i]);
                }
            }

            const depthRange = rearProjection - frontProjection;
            if (!Number.isFinite(depthRange) || depthRange <= 0) return;

            const backRegionStart = frontProjection + depthRange * 0.3;
            let lowerHeight = Number.POSITIVE_INFINITY;
            let upperHeight = Number.NEGATIVE_INFINITY;
            let leftSide = Number.POSITIVE_INFINITY;
            let rightSide = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < position.count; i++) {
                if (weights[i] > 0.05 && projections[i] >= backRegionStart) {
                    lowerHeight = Math.min(lowerHeight, heights[i]);
                    upperHeight = Math.max(upperHeight, heights[i]);
                    leftSide = Math.min(leftSide, sides[i]);
                    rightSide = Math.max(rightSide, sides[i]);
                }
            }
            if (!Number.isFinite(lowerHeight) || upperHeight <= lowerHeight || rightSide <= leftSide) return;

            deformation = {
                original,
                weights,
                projections,
                heights,
                sides,
                frontProjection,
                rearProjection,
                lowerHeight,
                upperHeight,
                centerSide: (leftSide + rightSide) * 0.5,
                halfWidth: (rightSide - leftSide) * 0.5,
                depthRange,
                direction: meshBack,
            };
            mesh.geometry = mesh.geometry.clone();
            mesh.userData.rearHipDeformation = deformation;
        }

        const position = mesh.geometry.getAttribute('position');
        if (!position) return;
        const {
            original, weights, projections, heights, sides,
            rearProjection, lowerHeight, upperHeight, centerSide, halfWidth,
            depthRange, direction,
        } = deformation;
        const frontDeformation = mesh.userData.frontChestDeformation || mesh.userData.frontStomachDeformation;
        const sizeDelta = hipSize - 1;
        const lowerStart = lowerHeight + (upperHeight - lowerHeight) * 0.18;
        const lowerEnd = lowerHeight + (upperHeight - lowerHeight) * 0.36;
        const upperStart = lowerHeight + (upperHeight - lowerHeight) * 0.62;
        const upperEnd = lowerHeight + (upperHeight - lowerHeight) * 0.78;
        const backCenter = rearProjection - depthRange * 0.08;
        const backRadius = depthRange * 0.3;

        for (let i = 0; i < position.count; i++) {
            const offset = i * 3;
            const weightT = THREE.MathUtils.clamp((weights[i] - 0.02) / 0.18, 0, 1);
            const weight = weightT * weightT * (3 - 2 * weightT);
            const lowerT = THREE.MathUtils.clamp((heights[i] - lowerStart) / (lowerEnd - lowerStart), 0, 1);
            const upperT = THREE.MathUtils.clamp((heights[i] - upperStart) / (upperEnd - upperStart), 0, 1);
            const lowerMask = lowerT * lowerT * (3 - 2 * lowerT);
            const upperMask = 1 - upperT * upperT * (3 - 2 * upperT);
            const backDistance = (projections[i] - backCenter) / backRadius;
            const backMask = Math.exp(-0.5 * backDistance * backDistance);
            const sideRatio = Math.abs(sides[i] - centerSide) / halfWidth;
            const sideDistance = (sideRatio - 0.22) / 0.52;
            const sideMask = Math.exp(-0.5 * sideDistance * sideDistance);
            const outerT = THREE.MathUtils.clamp((sideRatio - 0.95) / 0.22, 0, 1);
            const outerMask = 1 - outerT * outerT * (3 - 2 * outerT);
            const displacement = depthRange * 0.35 * sizeDelta * weight * lowerMask * upperMask * backMask * sideMask * outerMask;

            const x = frontDeformation ? position.getX(i) : original[offset];
            const y = frontDeformation ? position.getY(i) : original[offset + 1];
            const z = frontDeformation ? position.getZ(i) : original[offset + 2];
            position.setXYZ(i, x + direction.x * displacement, y + direction.y * displacement, z + direction.z * displacement);
        }
        position.needsUpdate = true;
        mesh.userData.exportDeformedGeometry = true;
        if (mesh.geometry.index) mesh.geometry.computeVertexNormals();
    });
};

const applyFrontStomachDeformation = (vrm: VRM, stomachSize: number, stomachForwardSize: number) => {
    const stomachBone = vrm.humanoid?.getRawBoneNode(VRMHumanBoneName.Spine);
    if (!stomachBone) return;

    const boneRotation = stomachBone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const frontInBone = new THREE.Vector3(0, 0, 1).applyQuaternion(boneRotation).normalize();
    const upInBone = new THREE.Vector3(0, 1, 0).applyQuaternion(boneRotation).normalize();
    const sideInBone = new THREE.Vector3(1, 0, 0).applyQuaternion(boneRotation).normalize();

    vrm.scene.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh || !mesh.skeleton) return;

        let deformation = mesh.userData.frontStomachDeformation;
        if (!deformation) {
            const position = mesh.geometry.getAttribute('position');
            const skinIndex = mesh.geometry.getAttribute('skinIndex');
            const skinWeight = mesh.geometry.getAttribute('skinWeight');
            const stomachIndex = mesh.skeleton.bones.indexOf(stomachBone as THREE.Bone);
            if (!position || !skinIndex || !skinWeight || stomachIndex < 0) return;

            const chestOriginal = mesh.userData.frontChestDeformation?.original as Float32Array | undefined;
            const original = chestOriginal || (() => {
                const values = new Float32Array(position.count * 3);
                for (let i = 0; i < position.count; i++) {
                    values[i * 3] = position.getX(i);
                    values[i * 3 + 1] = position.getY(i);
                    values[i * 3 + 2] = position.getZ(i);
                }
                return values;
            })();
            const meshToBone = new THREE.Matrix4()
                .multiplyMatrices(mesh.skeleton.boneInverses[stomachIndex], mesh.bindMatrix);
            const boneToMesh = meshToBone.clone().invert();
            const meshFront = frontInBone.clone().transformDirection(boneToMesh);
            const weights = new Float32Array(position.count);
            const projections = new Float32Array(position.count);
            const heights = new Float32Array(position.count);
            const sides = new Float32Array(position.count);
            const vertex = new THREE.Vector3();
            let frontProjection = Number.NEGATIVE_INFINITY;
            let rearProjection = Number.POSITIVE_INFINITY;

            for (let i = 0; i < position.count; i++) {
                let boneWeight = 0;
                for (let j = 0; j < 4; j++) {
                    if (skinIndex.getComponent(i, j) === stomachIndex) boneWeight += skinWeight.getComponent(i, j);
                }
                vertex.set(original[i * 3], original[i * 3 + 1], original[i * 3 + 2]).applyMatrix4(meshToBone);
                weights[i] = boneWeight;
                projections[i] = vertex.dot(frontInBone);
                heights[i] = vertex.dot(upInBone);
                sides[i] = vertex.dot(sideInBone);
                if (boneWeight > 0.05) {
                    frontProjection = Math.max(frontProjection, projections[i]);
                    rearProjection = Math.min(rearProjection, projections[i]);
                }
            }

            const depthRange = frontProjection - rearProjection;
            if (!Number.isFinite(depthRange) || depthRange <= 0) return;
            let lowerHeight = Number.POSITIVE_INFINITY;
            let upperHeight = Number.NEGATIVE_INFINITY;
            let leftSide = Number.POSITIVE_INFINITY;
            let rightSide = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < position.count; i++) {
                if (weights[i] <= 0.05) continue;
                lowerHeight = Math.min(lowerHeight, heights[i]);
                upperHeight = Math.max(upperHeight, heights[i]);
                leftSide = Math.min(leftSide, sides[i]);
                rightSide = Math.max(rightSide, sides[i]);
            }
            if (!Number.isFinite(lowerHeight) || upperHeight <= lowerHeight || rightSide <= leftSide) return;

            deformation = {
                original,
                weights,
                projections,
                heights,
                sides,
                rearProjection,
                lowerHeight,
                upperHeight,
                centerSide: (leftSide + rightSide) * 0.5,
                halfWidth: (rightSide - leftSide) * 0.5,
                depthRange,
                direction: meshFront,
                sideDirection: sideInBone.clone().transformDirection(boneToMesh),
            };
            mesh.geometry = mesh.geometry.clone();
            mesh.userData.frontStomachDeformation = deformation;
        }

        const position = mesh.geometry.getAttribute('position');
        if (!position) return;
        const { original, weights, projections, heights, sides, rearProjection, lowerHeight, upperHeight, centerSide, halfWidth, depthRange, direction, sideDirection } = deformation;
        const lowerStart = lowerHeight + (upperHeight - lowerHeight) * 0.14;
        const lowerEnd = lowerHeight + (upperHeight - lowerHeight) * 0.44;
        const upperStart = lowerHeight + (upperHeight - lowerHeight) * 0.87;
        const upperEnd = lowerHeight + (upperHeight - lowerHeight) * 0.99;
        const frontCenter = rearProjection + depthRange * 0.84;
        const frontRadius = depthRange * 0.42;
        const stomachSizeDelta = stomachSize - 1;
        const stomachForwardDelta = stomachForwardSize - 1;
        const smootherStep = (value: number) => value * value * value * (value * (value * 6 - 15) + 10);

        for (let i = 0; i < position.count; i++) {
            const offset = i * 3;
            const weightT = THREE.MathUtils.clamp((weights[i] - 0.02) / 0.18, 0, 1);
            const weight = weightT * weightT * (3 - 2 * weightT);
            const lowerT = THREE.MathUtils.clamp((heights[i] - lowerStart) / (lowerEnd - lowerStart), 0, 1);
            const lowerMask = smootherStep(lowerT);
            const profileT = THREE.MathUtils.clamp(
                (projections[i] - (rearProjection + depthRange * 0.55)) / (depthRange * 0.45),
                0,
                1,
            );
            const topArc = Math.sin(Math.PI * profileT) ** 2;
            const topLift = (upperHeight - lowerHeight) * 0.05 * topArc;
            const upperT = THREE.MathUtils.clamp((heights[i] - (upperStart + topLift)) / (upperEnd + topLift - upperStart - topLift), 0, 1);
            const upperMask = 1 - smootherStep(upperT);
            const bellyCenterHeight = lowerHeight + (upperHeight - lowerHeight) * 0.62 + topLift;
            const bellyHeightRadius = (upperHeight - lowerHeight) * 0.23;
            const bellyHeightDistance = (heights[i] - bellyCenterHeight) / bellyHeightRadius;
            const forwardHeightMask = Math.exp(-0.5 * bellyHeightDistance * bellyHeightDistance);
            const frontDistance = (projections[i] - frontCenter) / frontRadius;
            const frontFalloff = Math.exp(-0.5 * frontDistance * frontDistance);
            const frontMask = THREE.MathUtils.smoothstep(
                projections[i],
                rearProjection + depthRange * 0.5,
                rearProjection + depthRange * 0.74,
            ) * frontFalloff;
            const sideRatio = Math.abs(sides[i] - centerSide) / halfWidth;
            const frontSideMask = Math.exp(-0.5 * (sideRatio / 1.02) ** 4);
            const frontOuterT = THREE.MathUtils.clamp((sideRatio - 1.12) / 0.22, 0, 1);
            const frontOuterMask = 1 - frontOuterT * frontOuterT * (3 - 2 * frontOuterT);
            const upperForwardT = THREE.MathUtils.clamp(
                (heights[i] - (lowerHeight + (upperHeight - lowerHeight) * 0.58)) / ((upperHeight - lowerHeight) * 0.3),
                0,
                1,
            );
            const upperForwardBoost = smootherStep(upperForwardT) * 0.3;
            const forwardDisplacement = depthRange * 0.5 * stomachForwardDelta * weight * forwardHeightMask * frontMask * frontSideMask * frontOuterMask * (1 + upperForwardBoost);
            const sideDistance = (sideRatio - 0.76) / 0.28;
            const sideMask = Math.exp(-0.5 * sideDistance * sideDistance);
            const sideOuterT = THREE.MathUtils.clamp((sideRatio - 1.0) / 0.14, 0, 1);
            const sideOuterMask = 1 - sideOuterT * sideOuterT * (3 - 2 * sideOuterT);
            const sideDisplacement = depthRange * 0.15 * stomachSizeDelta * weight * lowerMask * upperMask * sideMask * sideOuterMask;
            const sideSign = sides[i] < centerSide ? -1 : 1;
            const baseX = mesh.userData.frontChestDeformation ? position.getX(i) : original[offset];
            const baseY = mesh.userData.frontChestDeformation ? position.getY(i) : original[offset + 1];
            const baseZ = mesh.userData.frontChestDeformation ? position.getZ(i) : original[offset + 2];
            position.setXYZ(
                i,
                baseX + direction.x * forwardDisplacement + sideDirection.x * sideSign * sideDisplacement,
                baseY + direction.y * forwardDisplacement + sideDirection.y * sideSign * sideDisplacement,
                baseZ + direction.z * forwardDisplacement + sideDirection.z * sideSign * sideDisplacement,
            );
        }
        position.needsUpdate = true;
        if (mesh.geometry.index) mesh.geometry.computeVertexNormals();
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

    setDesired(VRMHumanBoneName.Hips, 1.0, 1.0, 1.0);
    const stomachWidthScale = 1 + (params.stomachSize - 1) * 0.15;
    setDesired(VRMHumanBoneName.Spine, params.waistWidth * stomachWidthScale, params.torsoHeight, params.stomachSize);

    const chestWidth = params.shoulderWidth;

    if (hasUpperChest) {
        setDesired(VRMHumanBoneName.Chest, chestWidth, 1.0, params.stomachSize);
        setDesired(VRMHumanBoneName.UpperChest, chestWidth, 1.0, 1.0);
    } else {
        setDesired(VRMHumanBoneName.Chest, chestWidth, 1.0, 1.0);
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
            node.position.x = 0;
            node.position.y = node.userData.initialY;
            node.position.z = node.userData.initialZ;

            updateRootPosition(vrm, params, node);
        }

        const isChestTarget = hasUpperChest
            ? (boneName === VRMHumanBoneName.UpperChest)
            : (boneName === VRMHumanBoneName.Chest);

        if (isChestTarget) {
            node.position.z = node.userData.initialZ;
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

    vrm.scene.updateMatrixWorld(true);
    applyFrontChestDeformation(vrm, chestBone, params.chestSize);
    applyFrontStomachDeformation(vrm, params.stomachSize, params.stomachForwardSize);
    applyRearHipDeformation(vrm, params.hipSize);

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

export const disposeVRM = (vrm: VRM) => {
    vrm.scene.traverse((object: any) => {
        if (object.isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.geometry.dispose();

            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((mat) => {
                        disposeMaterial(mat);
                    });
                } else {
                    disposeMaterial(mesh.material);
                }
            }
        }
    });

    const proxy = vrm.scene.children.find(child => (child as any).type === 'VRMLookAtQuaternionProxy');
    if (proxy) {
        vrm.scene.remove(proxy);
    }
};

const disposeMaterial = (material: THREE.Material) => {
    material.dispose();

    for (const key in material) {
        const value = (material as any)[key];
        if (value && value.isTexture) {
            value.dispose();
        }
    }
};
