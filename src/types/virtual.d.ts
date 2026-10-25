declare module "virtual:project-map" {
    /** Position of each project on the similarity map (0–1), and its two most similar projects. */
    const map: { x: number, y: number, z: number, neighbors: number[] }[];
    export default map;
}
