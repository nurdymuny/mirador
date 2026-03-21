# MIRADOR

## Manifold-Informed Rational Architecture for Drug-Organism Response

### Technical Specification v0.2 — TDD & Mathematical Validation

**Davis Lab / Davis Geometric**
**Author: Bee Rosa Davis**
**Date: March 2026**
**Branch: XI (Therapeutic Geometry)**
**Governing Equation: C = τ/K**

## 0. Preamble

MIRADOR is the constructive dual of HERALD. Where HERALD detects biological disruption as curvature anomaly, MIRADOR designs biological restoration by maximizing coherence. The same Davis Field Equation governs both: C = τ/K. The arrow reverses.

The core thesis: given a fully diagnosed disease state in a specific patient, MIRADOR constructs the optimal therapeutic molecule (or combination) by solving for maximum coherence on the patient-specific therapeutic manifold. This is personalized medicine derived from first principles, not statistical correlation.

## 1. Architecture Overview

MIRADOR is a ten-layer simulation pipeline. Each layer has:

- A mathematical object it constructs or computes
- A set of invariants that must hold (test oracles)
- Property-based tests derived from the geometry
- Integration tests that verify coherence with adjacent layers
- Known-answer tests from validated pharmacological data

```
Layer 0:  Patient Genome/Phenome         → Patient Manifold (P, g_P)
Layer 1:  Disease Target                 → Target Manifold (T, h)
Layer 2:  Molecular Configuration Space  → Candidate Manifold (M, g_M)
Layer 3:  Binding Interaction            → Fiber Bundle π: E → T
Layer 4:  Pharmacophore Extraction       → Topological Invariant τ
Layer 5:  ADMET Curvature                → Total Curvature K
Layer 6:  Coherence Optimization         → C* = max(τ/K)
Layer 7:  Resistance Prediction          → Holonomy Group Hol(∇)
Layer 8:  Combination Therapy            → Tensor Product E₁ ⊗ E₂
Layer 9:  Dosing Schedule                → Parallel Transport along c(t)
```

Each layer is a module. Each module is tested independently and then in composition. The simulation runs forward through layers 0→9 and can backpropagate constraints from any layer to any earlier layer.

### 1.1 Technology Stack

**Core Engine: Rust.** All computational layers (0–9) are implemented in Rust. The simulation pipeline, manifold algebra, fiber bundle operations, curvature computation, Riemannian optimization, and holonomy solver are Rust-native. This gives us sub-millisecond layer traversal (matching CHIHIRO's sub-10ms precedent), memory safety without GC pauses during real-time visualization, and zero-copy data flow between layers.

**Python Modules (where necessary):**
- Data ingestion adapters (PDB/AlphaFold parsers, PharmGKB loaders, FASTA/FASTQ readers)
- ML model wrappers (latent space decoders, ADMET predictors where pretrained models exist)
- RDKit bindings for cheminformatics primitives (SMILES parsing, fingerprint generation)
- PyO3 bridge: all Python modules expose a C-ABI that the Rust core calls via FFI; Rust never depends on Python at runtime for any computational path

**Crate dependencies (Rust):**
- `nalgebra` — linear algebra, matrix operations, eigendecomposition
- `ndarray` — n-dimensional arrays for manifold coordinate storage
- `rayon` — parallel iteration across conformational ensembles and candidate molecules
- `petgraph` — molecular graphs, pathway topology
- `serde` / `bincode` — zero-copy serialization between layers and to the frontend
- `wgpu` — GPU-accelerated curvature and parallel transport computation
- Custom crates: `davis-manifold`, `davis-bundle`, `davis-homology`

**Frontend: 3D Molecular Visualization.** MIRADOR includes a real-time 3D visualization layer for inspecting disease targets (RNA/DNA structure, protein conformations) alongside candidate therapeutic molecules. See Section 13.5 for full specification.

### 1.2 Rust Module Layout

```
mirador/
├── Cargo.toml
├── crates/
│   ├── mirador-core/          # C = τ/K engine, shared types
│   │   ├── src/lib.rs
│   │   ├── src/manifold.rs    # Riemannian manifold trait + impls
│   │   ├── src/bundle.rs      # Fiber bundle, connection, curvature
│   │   ├── src/coherence.rs   # C = τ/K computation
│   │   └── src/types.rs       # PatientState, Molecule, Conformation, etc.
│   ├── mirador-patient/       # Layer 0: Patient Manifold
│   ├── mirador-target/        # Layer 1: Target Manifold
│   ├── mirador-candidate/     # Layer 2: Candidate Manifold
│   ├── mirador-bundle/        # Layer 3: Fiber Bundle Construction
│   ├── mirador-pharmacophore/ # Layer 4: τ extraction (persistent homology)
│   ├── mirador-admet/         # Layer 5: K curvature computation
│   ├── mirador-optimizer/     # Layer 6: Riemannian gradient ascent
│   ├── mirador-resistance/    # Layer 7: Holonomy & escape geodesics
│   ├── mirador-combination/   # Layer 8: Tensor product bundles
│   ├── mirador-dosing/        # Layer 9: PK parallel transport
│   ├── mirador-viz/           # 3D visualization engine (WebGPU/Three.js bridge)
│   └── mirador-py/            # PyO3 bridge to Python modules
├── python/
│   ├── mirador_ingest/        # Data ingestion (PDB, PharmGKB, ZINC, ChEMBL)
│   ├── mirador_ml/            # ML model wrappers (VAE decoder, ADMET predictors)
│   └── mirador_rdkit/         # RDKit cheminformatics bindings
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main application shell
│   │   ├── MoleculeViewer.tsx # 3D molecule renderer (Three.js / React Three Fiber)
│   │   ├── SequenceViewer.tsx # RNA/DNA sequence with structure overlay
│   │   ├── CoherenceHUD.tsx   # Real-time C = τ/K dashboard
│   │   ├── PipelineView.tsx   # Layer-by-layer pipeline visualization
│   │   └── PatientPanel.tsx   # Patient manifold coordinate editor
│   ├── shaders/
│   │   ├── molecule.wgsl      # Molecular surface shader (van der Waals, electrostatic)
│   │   ├── curvature.wgsl     # Curvature heatmap overlay
│   │   └── bundle.wgsl        # Fiber bundle section visualization
│   └── package.json
└── tests/
    ├── rust/                  # Rust unit + integration tests (cargo test)
    └── validation/            # Mathematical validation suite (Python)

## 2. Layer 0: Patient Manifold

### 2.0 Mathematical Object

The patient manifold **(P, g_P)** is a Riemannian manifold encoding the patient's unique biological state. Coordinates include:

- **Genomic coordinates**: SNP profile, HLA type, pharmacogenomic variants (CYP2D6, CYP2C19, CYP3A4 metabolizer status)
- **Phenomic coordinates**: age, weight, organ function (eGFR, liver enzymes, cardiac output), comorbidities
- **Microbiome coordinates**: gut flora composition as a distribution on microbial species space
- **Immune coordinates**: T-cell repertoire, antibody profile, cytokine baseline levels

The metric g_P encodes biological similarity: two patient states are "close" if they respond similarly to therapeutic intervention.

### 2.1 Data Structures

```rust
/// Patient state vector on the patient manifold
struct PatientManifold {
    // Genomic fiber
    snp_profile: Vec<SNPVariant>,          // ~4.1M common variants
    hla_type: HLAProfile,                  // MHC class I & II
    pharmacogenomic: PharmacogenomicPanel,  // CYP450 metabolizer status
    
    // Phenomic fiber
    age_years: f64,
    weight_kg: f64,
    organ_function: OrganFunctionVector,   // eGFR, ALT, AST, EF, etc.
    comorbidities: Vec<ICD10Code>,
    
    // Microbiome fiber
    microbiome: Distribution<SpeciesID>,
    
    // Immune fiber
    tcell_repertoire: RepertoireVector,
    antibody_profile: AntibodySpectrum,
    cytokine_baseline: CytokineVector,
    
    // Riemannian structure
    metric: PatientMetricTensor,  // g_P: encodes similarity of therapeutic response
}

/// The metric tensor on patient space
/// g_P(v, w) measures how similarly two perturbation directions
/// affect therapeutic outcome
struct PatientMetricTensor {
    genomic_weight: f64,      // relative importance of genomic vs phenomic
    phenomic_weight: f64,
    microbiome_weight: f64,
    immune_weight: f64,
    cross_terms: CrossTermMatrix,  // off-diagonal: gene-phenotype interactions
}
```

### 2.2 Tests

```
TEST 0.1 — Metric Symmetry
  GIVEN: any two tangent vectors v, w at patient state p
  THEN:  g_P(v, w) = g_P(w, v)
  VALIDATION: symmetric bilinear form

TEST 0.2 — Metric Positive-Definiteness
  GIVEN: any nonzero tangent vector v at patient state p
  THEN:  g_P(v, v) > 0
  VALIDATION: all eigenvalues of g_P are strictly positive

TEST 0.3 — Pharmacogenomic Consistency
  GIVEN: patient with CYP2D6 poor metabolizer status
  THEN:  K_met(codeine) > K_met(morphine)
  RATIONALE: codeine requires CYP2D6 for activation; poor metabolizers
             cannot convert it, yielding high metabolic curvature (failure)
  KNOWN ANSWER: codeine is contraindicated in CYP2D6 poor metabolizers

TEST 0.4 — Twin Concordance
  GIVEN: monozygotic twins (identical genomic fiber)
  THEN:  d_P(twin_1, twin_2) depends only on phenomic, microbiome, immune fibers
  VALIDATION: genomic contribution to distance is exactly zero

TEST 0.5 — Age Continuity
  GIVEN: patient state at age t and t + ε
  THEN:  d_P(state(t), state(t+ε)) → 0 as ε → 0
  VALIDATION: patient manifold trajectory is continuous

TEST 0.6 — Metabolizer Geodesic Separation
  GIVEN: CYP2D6 ultra-rapid metabolizer vs poor metabolizer
  THEN:  geodesic distance on pharmacogenomic submanifold exceeds
         threshold δ_met (calibrated from clinical phenotyping data)
  KNOWN ANSWER: these are maximally separated metabolizer phenotypes
```

### 2.3 Mathematical Validation

The patient manifold must satisfy:

**V0.1**: dim(P) = dim(genomic) + dim(phenomic) + dim(microbiome) + dim(immune). The fibers are independent coordinate charts glued by the cross-term matrix.

**V0.2**: The metric g_P is calibrated against population pharmacokinetic (PopPK) data. Two patients are metrically close if and only if they have similar drug clearance rates across a panel of reference compounds (warfarin, caffeine, dextromethorphan, omeprazole, midazolam — the standard CYP probe cocktail).

**V0.3**: Exponential map exp_p: T_pP → P is well-defined in a neighborhood of every patient state. This ensures local linearization is valid for perturbation analysis (e.g., "what happens if eGFR drops by 10%").

## 3. Layer 1: Target Manifold

### 3.0 Mathematical Object

The disease target manifold **(T, h)** is the conformational space of the biological target (protein, receptor complex, metabolic pathway, or cellular state) equipped with a metric encoding functional similarity between conformations.

A "target" in MIRADOR is not just a protein — it is the full dynamical object: the protein in its cellular context, in the patient's body, subject to the patient's metabolic environment.

### 3.1 Data Structures

```rust
/// Disease target in its full context
struct TargetManifold {
    // Core structure
    target_type: TargetType,  // Protein | ReceptorComplex | Pathway | CellState
    conformations: Vec<Conformation3D>,  // sampled from MD or cryo-EM ensemble
    
    // Dynamical data
    energy_landscape: PotentialEnergySurface,
    transition_rates: TransitionMatrix,  // Markov model of conformational switching
    
    // Patient-specific modulation
    patient_context: PatientManifoldRef,  // back-reference to Layer 0
    expression_level: f64,               // tissue-specific, patient-specific
    post_translational_mods: Vec<PTM>,   // phosphorylation, glycosylation, etc.
    
    // Riemannian structure
    metric: ConformationMetricTensor,  // h: RMSD-derived or functional
}

enum TargetType {
    Protein { pdb_ids: Vec<String>, uniprot: String },
    ReceptorComplex { subunits: Vec<Protein>, stoichiometry: Vec<u32> },
    Pathway { nodes: Vec<Protein>, edges: Vec<Interaction> },
    CellState { markers: Vec<BioMarker>, phenotype: CellPhenotype },
}

/// A single conformational state
struct Conformation3D {
    atom_positions: Vec<[f64; 3]>,
    binding_sites: Vec<BindingSite>,
    electrostatic_surface: ElectrostaticMesh,
    hydrophobic_map: HydrophobicMesh,
}
```

### 3.2 Tests

```
TEST 1.1 — Conformational Metric Validity
  GIVEN: any two conformations c1, c2 in T
  THEN:  h(c1, c2) ≥ 0, with equality iff c1 = c2
  VALIDATION: metric is a proper distance function

TEST 1.2 — Boltzmann Consistency
  GIVEN: energy landscape E(c) and temperature T_body = 310K
  THEN:  stationary distribution π(c) ∝ exp(-E(c)/k_B T_body)
  VALIDATION: transition matrix has π as its stationary distribution
  TOLERANCE: KL divergence < 0.01 against MD reference

TEST 1.3 — Binding Site Persistence
  GIVEN: conformational ensemble of target
  THEN:  binding sites with persistence > 0.8 across ensemble
         are classified as "druggable"
  RATIONALE: a binding site that only exists in rare conformations
             is not a reliable drug target

TEST 1.4 — Patient-Specific Target State
  GIVEN: same protein, two patients with different PTM profiles
  THEN:  conformational ensembles differ measurably
  KNOWN ANSWER: phosphorylation of kinase activation loop shifts
                the ensemble toward active conformation
  VALIDATION: ensemble centroid RMSD > 1.5Å between states

TEST 1.5 — Pathway Coherence
  GIVEN: TargetType::Pathway with N nodes
  THEN:  perturbation at node i propagates to node j with
         amplitude decaying as exp(-d_pathway(i,j) / ξ)
         where ξ is the pathway coherence length
  VALIDATION: ξ is finite and matches experimental dose-response
              data for pathway inhibitors (e.g., MAPK cascade)

TEST 1.6 — Expression-Weighted Metric
  GIVEN: target with expression_level = 0 in patient tissue
  THEN:  target is unreachable (infinite distance in patient-adjusted metric)
  RATIONALE: you cannot drug a target that is not expressed
```

### 3.3 Mathematical Validation

**V1.1**: The metric h is derived from the RMSD (root-mean-square deviation) between aligned conformations, corrected by the Boltzmann weight of each conformation. This makes h a proper Riemannian metric, not just a distance.

**V1.2**: The conformational manifold T is compact (bounded energy landscape) and connected (any conformation can reach any other through thermal fluctuations, given sufficient time). This ensures geodesics exist between any two conformational states.

**V1.3**: Patient-specific modulation enters as a **pullback**: the patient manifold P acts on T by modifying the energy landscape. The combined object is a fiber bundle π_PT: P ×_f T → P, where f encodes how patient state modulates target dynamics.

## 4. Layer 2: Candidate Manifold

### 4.0 Mathematical Object

The candidate manifold **(M, g_M)** is the space of all possible therapeutic molecules. This is an astronomically large space (~10^60 drug-like molecules), but it has rich geometric structure.

### 4.1 Data Structures

```rust
/// The space of candidate molecules
struct CandidateManifold {
    // Molecular representation
    representation: MolecularRepresentation,
    
    // Riemannian structure
    metric: MolecularMetricTensor,
    
    // Submanifold constraints
    drug_likeness_boundary: DrugLikenessBoundary,  // Lipinski-derived
    synthesis_accessibility: SynthesisScore,
}

enum MolecularRepresentation {
    /// 3D conformer with electrostatic surface
    Conformer3D {
        atoms: Vec<Atom>,
        bonds: Vec<Bond>,
        electrostatic: ElectrostaticMesh,
        pharmacophore_features: Vec<PharmacophoreFeature>,
    },
    /// Graph representation for topological analysis
    MolecularGraph {
        adjacency: SparseMatrix,
        atom_features: Vec<AtomFeature>,
        bond_features: Vec<BondFeature>,
    },
    /// Continuous latent space (VAE-encoded)
    LatentVector {
        z: Vec<f64>,       // dim ~ 256-512
        decoder: DecoderRef,
    },
}

/// Features that define the pharmacophore
enum PharmacophoreFeature {
    HydrogenBondDonor { position: [f64; 3], direction: [f64; 3] },
    HydrogenBondAcceptor { position: [f64; 3], direction: [f64; 3] },
    PositiveCharge { position: [f64; 3] },
    NegativeCharge { position: [f64; 3] },
    Hydrophobic { position: [f64; 3], radius: f64 },
    Aromatic { position: [f64; 3], normal: [f64; 3] },
}
```

### 4.2 Tests

```
TEST 2.1 — Metric Triangle Inequality
  GIVEN: any three molecules m1, m2, m3
  THEN:  d_M(m1, m3) ≤ d_M(m1, m2) + d_M(m2, m3)
  VALIDATION: proper metric space

TEST 2.2 — Lipinski Boundary Is a Submanifold
  GIVEN: the set L = {m ∈ M : MW(m) ≤ 500, logP(m) ≤ 5, HBD(m) ≤ 5, HBA(m) ≤ 10}
  THEN:  L is a closed, bounded submanifold of M
  VALIDATION: boundary ∂L is smooth (constraint gradients are linearly independent)

TEST 2.3 — Latent Space Roundtrip
  GIVEN: molecule m, encode to z = enc(m), decode to m' = dec(z)
  THEN:  d_M(m, m') < ε_reconstruction
  VALIDATION: autoencoder preserves molecular identity
  TOLERANCE: Tanimoto similarity > 0.95

TEST 2.4 — Geodesic Interpolation Validity
  GIVEN: two drug-like molecules m1, m2, geodesic γ(t) from m1 to m2
  THEN:  dec(γ(t)) is a valid molecule for all t ∈ [0, 1]
  VALIDATION: every point on the geodesic decodes to a chemically valid structure

TEST 2.5 — Pharmacophore Feature Stability
  GIVEN: molecule m, perturbation δm with ||δm|| < ε
  THEN:  pharmacophore features of m + δm are a perturbation of features of m
         (no features appear or vanish discontinuously)
  VALIDATION: pharmacophore map is continuous

TEST 2.6 — Synthesis Accessibility Gradient
  GIVEN: molecule m near a synthesis-inaccessible region
  THEN:  ∇(SynthesisScore)(m) points toward more accessible molecules
  VALIDATION: gradient descent on synthesis score produces synthesizable analogs
```

### 4.3 Mathematical Validation

**V2.1**: The metric g_M is a Wasserstein-type metric on 3D electrostatic surfaces: the cost of "transporting" the electrostatic profile of one molecule into another. This is the natural metric for binding: two molecules are close if they present similar electrostatic profiles to a target.

**V2.2**: The drug-likeness boundary defines a compact submanifold with smooth boundary, ensuring that optimization within L is a constrained Riemannian optimization problem with well-defined KKT conditions.

## 5. Layer 3: Fiber Bundle Construction

### 5.0 Mathematical Object

The therapeutic fiber bundle **π: E → T** is the central geometric object of MIRADOR.

- Base space: target manifold T (what we're trying to hit)
- Total space: E (all drug-target interaction states)
- Fiber: M_t ⊂ M (molecules that can interact with target in conformation t)
- Structure group: G = group of molecular transformations preserving binding mode
- Connection ∇: encodes how binding affinity varies as target flexes
- Curvature F_∇: encodes off-target effects as "leakage" into orthogonal fibers

### 5.1 Data Structures

```rust
/// The therapeutic fiber bundle
struct TherapeuticBundle {
    base: TargetManifold,          // T
    fiber_type: CandidateManifold, // typical fiber M
    
    // Bundle structure
    local_trivializations: Vec<LocalTrivialization>,
    transition_functions: Vec<TransitionFunction>,
    structure_group: BindingModeGroup,
    
    // Connection and curvature
    connection: TherapeuticConnection,
    curvature: CurvatureTensor,
    
    // Sections (candidate drugs)
    sections: Vec<TherapeuticSection>,
}

/// A local trivialization: identifies the fiber over an open set of T
struct LocalTrivialization {
    domain: ConformationNeighborhood,  // open set in T
    map: Box<dyn Fn(Conformation3D) -> FiberSlice>,  // π^{-1}(U) → U × M
}

/// The connection: tells us how to parallel-transport drugs across target conformations
struct TherapeuticConnection {
    /// Connection 1-form A ∈ Ω¹(T, Lie(G))
    /// In coordinates: A_μ^a where μ indexes target conformation directions
    /// and a indexes the Lie algebra of the structure group
    connection_form: ConnectionOneForm,
}

/// A section of the bundle: a specific drug candidate
struct TherapeuticSection {
    molecule: MolecularRepresentation,
    binding_mode: BindingMode,
    
    /// Binding affinity at each target conformation
    /// This is the section σ: T → E, evaluated pointwise
    affinity_map: Box<dyn Fn(Conformation3D) -> BindingAffinity>,
    
    /// Coherence: how smoothly binding affinity varies across conformations
    coherence: f64,  // C = τ/K for this section
}
```

### 5.2 Tests

```
TEST 3.1 — Bundle Consistency (Cocycle Condition)
  GIVEN: three overlapping trivializations U_α, U_β, U_γ
  THEN:  g_αβ · g_βγ · g_γα = identity  on U_α ∩ U_β ∩ U_γ
  VALIDATION: transition functions satisfy the cocycle condition
              (bundle is globally well-defined)

TEST 3.2 — Connection Compatibility
  GIVEN: connection ∇ and structure group G
  THEN:  ∇ is G-compatible: parallel transport preserves G-structure
  VALIDATION: for any G-transformation g and section σ,
              ∇_X(g·σ) = g·∇_X(σ) for G-equivariant sections

TEST 3.3 — Curvature as Off-Target Binding
  GIVEN: drug with known off-target profile (e.g., imatinib: ABL1, KIT, PDGFRα)
  THEN:  curvature F_∇ has nonzero components in the KIT and PDGFRα fiber directions
  KNOWN ANSWER: imatinib's multi-kinase activity is encoded as curvature
  TOLERANCE: rank of F_∇ matches number of known off-targets ± 1

TEST 3.4 — Flat Connection = Perfect Selectivity
  GIVEN: hypothetical perfectly selective drug (zero off-target binding)
  THEN:  F_∇ = 0 (flat connection)
  VALIDATION: curvature vanishes iff drug binds exclusively to intended target

TEST 3.5 — Section Smoothness
  GIVEN: therapeutic section σ (drug candidate)
  THEN:  σ is smooth: affinity varies continuously across target conformations
  VALIDATION: ||σ(t + δt) - P_γ σ(t)|| → 0 as δt → 0
              where P_γ is parallel transport along the geodesic from t to t+δt

TEST 3.6 — Fiber Dimensionality
  GIVEN: target conformation t
  THEN:  dim(M_t) = dim(M) - codim(binding constraints at t)
  VALIDATION: fiber dimension is consistent with the number of binding
              constraints (H-bonds, hydrophobic contacts, shape complementarity)
```

### 5.3 Mathematical Validation

**V3.1**: The structure group G is the group of molecular rigid motions (translations + rotations) composed with "soft" internal rotations (torsion angles) that preserve the binding mode. G ≅ SE(3) × T^k, where k = number of rotatable bonds in the binding pocket.

**V3.2**: The curvature F_∇ = dA + A ∧ A is a 2-form on T valued in Lie(G). Its trace ||F_∇||² integrates to the total off-target interaction energy. This is the "Yang-Mills action" of the therapeutic bundle — and minimizing it is equivalent to maximizing selectivity.

**V3.3**: Chern classes of the bundle E encode topological obstructions to perfect drugs. c₁(E) ≠ 0 implies no globally flat section exists — there is an irreducible minimum of off-target activity. This is a theorem, not an empirical observation.

## 6. Layer 4: Pharmacophore Extraction

### 6.0 Mathematical Object

The pharmacophore **τ** is the topological invariant of the therapeutic interaction. It is the minimal geometric arrangement of features that is necessary and sufficient for biological activity.

In Davis Field Equation terms: τ is the **topology** of the therapeutic section.

### 6.1 Data Structures

```rust
/// The pharmacophore as topological invariant
struct Pharmacophore {
    // Feature arrangement
    features: Vec<PharmacophoreFeature>,
    distance_constraints: Vec<DistanceConstraint>,
    angle_constraints: Vec<AngleConstraint>,
    
    // Topological decomposition
    tau_bind: BettiNumbers,   // Betti numbers of binding pocket
    tau_chiral: i8,           // +1 or -1 (orientation of molecular bundle)
    tau_ring: FundamentalGroup,  // π₁ of aromatic system
    
    // Composite invariant
    tau: f64,  // τ = |τ_bind| · τ_chiral · |τ_ring|
}

/// Betti numbers of the binding interaction
struct BettiNumbers {
    b0: usize,  // connected components (number of distinct binding modes)
    b1: usize,  // loops (channels, tunnels in the binding pocket)
    b2: usize,  // cavities (enclosed voids)
}

/// Distance constraint between pharmacophore features
struct DistanceConstraint {
    feature_i: usize,
    feature_j: usize,
    distance_min: f64,  // Angstroms
    distance_max: f64,  // Angstroms
    tolerance: f64,     // Angstroms
}
```

### 6.2 Tests

```
TEST 4.1 — Pharmacophore Equivalence
  GIVEN: two molecules m1, m2 with same pharmacophore τ
  THEN:  both bind the target with comparable affinity (within 10× K_d)
  KNOWN ANSWER: scaffold hopping — structurally different molecules
                with same pharmacophore share activity
  VALIDATION: across matched molecular pairs from ChEMBL

TEST 4.2 — Topological Invariance
  GIVEN: continuous deformation of molecule m that preserves binding mode
  THEN:  τ(m) is unchanged
  VALIDATION: τ is invariant under structure-group G transformations

TEST 4.3 — Betti Number Interpretation
  GIVEN: binding pocket with known geometry (e.g., HIV protease)
  THEN:  b0 = 1 (single binding mode), b1 = 1 (tunnel for substrate),
         b2 = 0 (no enclosed cavities in open active site)
  KNOWN ANSWER: HIV protease has a substrate tunnel (b1 = 1)

TEST 4.4 — Chirality Determines Activity
  GIVEN: enantiomeric pair (same τ_bind and τ_ring, opposite τ_chiral)
  THEN:  one enantiomer is active, the other is inactive or toxic
  KNOWN ANSWER: thalidomide — (R)-enantiomer is sedative,
                (S)-enantiomer is teratogenic
  VALIDATION: τ_chiral correctly separates the enantiomers

TEST 4.5 — Ring Topology Conservation
  GIVEN: aromatic ring system in a drug (e.g., quinoline in chloroquine)
  THEN:  τ_ring encodes the fundamental group of the ring system
  VALIDATION: π₁ of quinoline = Z (single aromatic loop)
              π₁ of naphthalene = Z × Z (two fused loops)

TEST 4.6 — τ Decomposition Multiplicativity
  GIVEN: pharmacophore τ with decomposition τ = τ_bind · τ_chiral · τ_ring
  THEN:  log(τ) = log|τ_bind| + log|τ_chiral| + log|τ_ring|
  VALIDATION: contributions are factorizable (log-additive)
              This enables independent optimization of each component.
```

### 6.3 Mathematical Validation

**V4.1**: The pharmacophore τ is a topological invariant in the precise sense: it is unchanged by continuous deformations of the molecule that do not alter the binding mode. Formally, τ = [σ] ∈ π₀(Γ(E)), the connected component of the section in the space of sections of the therapeutic bundle.

**V4.2**: The decomposition τ = τ_bind · τ_chiral · τ_ring corresponds to the Künneth decomposition of the homology of the interaction space into binding topology × chirality × aromaticity.

## 7. Layer 5: ADMET as Curvature

### 7.0 Mathematical Object

The total parasitic curvature **K** is the sum of five sectional curvatures representing Absorption, Distribution, Metabolism, Excretion, and Toxicity. Each is a geometric obstruction to the drug reaching and acting on its target.

### 7.1 Data Structures

```rust
/// ADMET curvature decomposition
struct ADMETCurvature {
    k_abs: AbsorptionCurvature,
    k_dist: DistributionCurvature,
    k_met: MetabolicCurvature,
    k_exc: ExcretionCurvature,
    k_tox: ToxicityCurvature,
    
    // Total curvature
    k_total: f64,  // K = K_abs + K_dist + K_met + K_exc + K_tox
    
    // Patient-specific modulation
    patient_modulation: PatientManifoldRef,
}

/// Absorption curvature: membrane crossing
struct AbsorptionCurvature {
    /// Sectional curvature of the membrane-crossing landscape
    /// High curvature = molecule distorts significantly during absorption
    membrane_permeability: f64,  // Papp (Caco-2)
    
    /// Lipinski parameters as curvature bounds
    molecular_weight: f64,  // MW; K_abs_MW = max(0, (MW - 500) / 500)
    log_p: f64,             // cLogP; K_abs_logP = max(0, (logP - 5) / 5)
    hbd_count: usize,       // H-bond donors; K_abs_HBD = max(0, (HBD - 5) / 5)
    hba_count: usize,       // H-bond acceptors; K_abs_HBA = max(0, (HBA - 10) / 10)
    
    /// Composite absorption curvature
    k_abs: f64,  // = Σ K_abs_i, normalized
}

/// Metabolic curvature: CYP450 as holonomy operators
struct MetabolicCurvature {
    /// CYP enzyme interactions
    cyp_interactions: Vec<CYPInteraction>,
    
    /// First-pass metabolism as holonomy
    /// The molecule "goes around the liver loop" and comes back transformed
    first_pass_holonomy: HolonomyElement,
    
    /// Patient-specific: metabolizer status from Layer 0
    metabolizer_status: PharmacogenomicPanel,
    
    k_met: f64,
}

struct CYPInteraction {
    enzyme: CYPEnzyme,        // CYP3A4, CYP2D6, etc.
    interaction_type: CYPType, // Substrate | Inhibitor | Inducer
    k_i_or_k_m: f64,          // inhibition constant or Michaelis constant
    
    /// Patient-specific metabolic rate
    /// Adjusted by pharmacogenomic status from Layer 0
    patient_rate: f64,
}

/// Toxicity curvature: off-target binding as curvature leakage
struct ToxicityCurvature {
    /// Each off-target is a curvature component in an orthogonal fiber direction
    off_target_bindings: Vec<OffTargetBinding>,
    
    /// hERG liability (cardiac toxicity)
    herg_k_i: Option<f64>,
    
    /// Genotoxicity (Ames test prediction)
    ames_probability: f64,
    
    k_tox: f64,
}
```

### 7.2 Tests

```
TEST 5.1 — Lipinski as Curvature Bound
  GIVEN: molecule satisfying all Lipinski Rule of Five criteria
  THEN:  K_abs < K_crit (absorption curvature below critical threshold)
  KNOWN ANSWER: ~90% of oral drugs satisfy Lipinski → K_abs < K_crit
  VALIDATION: K_crit calibrated so that 90% of approved oral drugs pass

TEST 5.2 — Curvature Additivity
  GIVEN: ADMET curvatures K_abs, K_dist, K_met, K_exc, K_tox
  THEN:  K_total = K_abs + K_dist + K_met + K_exc + K_tox
  VALIDATION: curvature contributions are independent to first order
  NOTE: cross-terms (e.g., metabolism affecting distribution) enter
        at second order and are tracked separately

TEST 5.3 — Patient-Specific Metabolic Curvature
  GIVEN: codeine administered to CYP2D6 poor metabolizer (from Layer 0)
  THEN:  K_met(codeine, patient) >> K_met(codeine, normal_metabolizer)
  KNOWN ANSWER: codeine is a prodrug requiring CYP2D6 activation;
                poor metabolizers get no analgesic effect
  VALIDATION: patient-specific K_met correctly predicts therapeutic failure

TEST 5.4 — hERG Curvature Dominance
  GIVEN: molecule with hERG IC50 < 1μM
  THEN:  K_tox > K_crit_cardiac (toxicity curvature exceeds cardiac safety threshold)
  KNOWN ANSWER: terfenadine was withdrawn for hERG liability
  VALIDATION: K_tox correctly flags terfenadine as above cardiac threshold

TEST 5.5 — Curvature Non-Negativity
  GIVEN: any molecule m and ADMET component K_i
  THEN:  K_i ≥ 0
  VALIDATION: curvature is non-negative (each ADMET property
              can only obstruct, never assist, therapeutic delivery)

TEST 5.6 — Metabolic Holonomy Is Patient-Dependent
  GIVEN: same drug, two patients with different CYP3A4 status
  THEN:  first_pass_holonomy differs between patients
  VALIDATION: the "loop through the liver" transforms the drug differently
              depending on the patient's enzyme complement

TEST 5.7 — Zero Curvature Limit
  GIVEN: hypothetical molecule with K_total = 0
  THEN:  C = τ/K → ∞ (infinite coherence)
  INTERPRETATION: a drug with zero ADMET penalty would be "perfect"
  VALIDATION: this limit is physically unreachable (K_total > 0 always)
              but the optimization pushes toward it
```

### 7.3 Mathematical Validation

**V5.1**: Each K_i is a sectional curvature of the molecule's trajectory through the corresponding biological compartment. K_abs is the sectional curvature of the membrane-crossing path. K_dist is the sectional curvature of the tissue-distribution path. This is not metaphor — the molecule's trajectory through the body is a curve on a Riemannian manifold, and curvature measures how much the trajectory deviates from a geodesic (the "ideal" path with no loss).

**V5.2**: Lipinski's Rule of Five is the statement K_abs < K_crit for a specific choice of metric. MIRADOR derives Lipinski as a special case and then generalizes: the curvature framework applies to any route of administration, any metabolic phenotype, any patient.

**V5.3**: CYP450 enzymes are holonomy operators: they parallel-transport the molecule around the metabolic loop, and the molecule comes back transformed. The holonomy group of the metabolic connection encodes the full set of metabolites. Patient-specific CYP status changes the connection, changing the holonomy, changing the metabolite profile.

## 8. Layer 6: Coherence Optimization

### 8.0 Mathematical Object

This is the heart of MIRADOR. Given τ (from Layer 4) and K (from Layer 5), compute:

**C* = max_{m ∈ M} τ(m) / K(m)**

subject to the constraint that m is drug-like (m ∈ L ⊂ M) and synthesizable.

### 8.1 Data Structures

```rust
/// Coherence optimization engine
struct CoherenceOptimizer {
    // Objective
    pharmacophore_target: Pharmacophore,  // τ_target from Layer 4
    admet_evaluator: ADMETCurvature,      // K evaluator from Layer 5
    
    // Constraints
    drug_likeness_boundary: DrugLikenessBoundary,
    synthesis_accessibility_threshold: f64,
    patient_manifold: PatientManifold,    // patient-specific from Layer 0
    
    // Optimization state
    current_best: Option<TherapeuticSection>,
    pareto_front: Vec<ParetoPoint>,  // τ vs K tradeoff frontier
}

struct ParetoPoint {
    molecule: MolecularRepresentation,
    tau: f64,
    k_total: f64,
    coherence: f64,  // C = τ/K
    
    // Decomposed scores
    tau_bind: f64,
    tau_chiral: i8,
    tau_ring: f64,
    k_abs: f64,
    k_dist: f64,
    k_met: f64,
    k_exc: f64,
    k_tox: f64,
}

/// The optimization algorithm: Riemannian gradient ascent on C = τ/K
struct RiemannianOptimizer {
    // Gradient of C on the candidate manifold M
    // ∇_M C = (K ∇τ - τ ∇K) / K²
    learning_rate: f64,
    momentum: f64,
    
    // Riemannian-specific
    retraction: RetractionMap,     // project back onto M after gradient step
    vector_transport: VectorTransport,  // transport momentum across manifold
    
    // Convergence
    tolerance: f64,       // |ΔC/C| < tolerance → converged
    max_iterations: usize,
}
```

### 8.2 Tests

```
TEST 6.1 — Gradient Correctness (Finite Difference)
  GIVEN: molecule m, perturbation direction v, step size ε
  THEN:  |∇C(m) · v - (C(m + εv) - C(m - εv)) / (2ε)| < O(ε²)
  VALIDATION: Riemannian gradient matches finite difference to second order

TEST 6.2 — Retraction Validity
  GIVEN: molecule m ∈ M, tangent vector v ∈ T_m M
  THEN:  R_m(v) ∈ M (retraction maps back onto the manifold)
         R_m(0) = m (zero step stays put)
         dR_m(0) = id (first-order matches exponential map)
  VALIDATION: retraction is a valid first-order approximation to exp

TEST 6.3 — Pareto Optimality
  GIVEN: point (τ*, K*) on the Pareto front
  THEN:  no molecule m exists with τ(m) ≥ τ* AND K(m) ≤ K*
         with at least one strict inequality
  VALIDATION: Pareto front is non-dominated

TEST 6.4 — Known Drug Recovery
  GIVEN: target = HIV protease, patient = generic adult
  THEN:  optimization recovers a molecule in the neighborhood of
         known HIV protease inhibitors (saquinavir, ritonavir, etc.)
  VALIDATION: recovered molecule has Tanimoto similarity > 0.5
              to at least one approved HIV PI
  TOLERANCE: top-10 candidates include at least one approved-drug neighbor

TEST 6.5 — Patient-Specific Optimum Differs
  GIVEN: same target, two patients with different CYP2D6 status
  THEN:  C*(patient_1) and C*(patient_2) correspond to different molecules
         OR same molecule with different predicted dosing
  VALIDATION: personalization produces measurably different optima

TEST 6.6 — Coherence Monotonicity Under Optimization
  GIVEN: sequence of iterates m_0, m_1, ..., m_n from gradient ascent
  THEN:  C(m_{i+1}) ≥ C(m_i) for all i (monotonically increasing)
  VALIDATION: optimizer does not decrease coherence (up to numerical tolerance)

TEST 6.7 — Double Cover Constraint
  GIVEN: optimal molecule m* with efficacy E and toxicity T
  THEN:  E(m*) + T(m*)² ≤ 1 (within the therapeutic sphere)
  VALIDATION: the Double Cover Principle E + T² = 1 bounds the
              achievable efficacy for any given toxicity level
```

### 8.3 Mathematical Validation

**V6.1**: The optimization C* = max(τ/K) is a Riemannian optimization problem on the compact manifold L (drug-like molecules). Compactness of L guarantees that C* exists (extreme value theorem on compact Riemannian manifolds).

**V6.2**: The Pareto front in (τ, K) space is the image of the critical set of the map m ↦ (τ(m), K(m)). By Sard's theorem, this image has measure zero in R², so the Pareto front is generically a curve (one-dimensional), parametrized by the tradeoff between binding strength and ADMET penalty.

**V6.3**: The Double Cover Principle E + T² = 1 is the therapeutic analog of the LEXICON result S + d² = 1. It asserts that efficacy and toxicity are constrained to the unit sphere in their joint space. Agonist/antagonist pairs live on opposite sheets: σ_agonist and σ_antagonist are sections of the same bundle with opposite orientation (τ_chiral = ±1).

## 9. Layer 7: Resistance Prediction

### 9.0 Mathematical Object

Drug resistance is holonomy. The holonomy group **Hol(∇)** of the therapeutic connection encodes all possible resistance mutations — the set of ways the target can change such that the drug "goes around the loop and comes back different."

### 9.1 Data Structures

```rust
/// Resistance prediction via holonomy
struct ResistancePrediction {
    // The therapeutic connection from Layer 3
    connection: TherapeuticConnection,
    
    // Holonomy group computation
    holonomy_group: HolonomyGroup,
    
    // Resistance landscape
    resistance_mutations: Vec<ResistanceMutation>,
    resistance_probability: Vec<f64>,  // P(mutation) from evolutionary model
    
    // Escape routes
    escape_geodesics: Vec<EscapeGeodesic>,
}

struct ResistanceMutation {
    mutation: TargetMutation,      // what changes in the target
    delta_affinity: f64,           // how much binding affinity drops
    holonomy_shift: HolonomyElement,  // how the holonomy group changes
    
    // Counter-strategy
    minimum_pharmacophore_perturbation: PharmacophorePerturb,
    coherence_after_perturbation: f64,  // new C after adapting drug
}

/// A geodesic along which the target "escapes" the drug
struct EscapeGeodesic {
    initial_conformation: Conformation3D,
    escape_direction: TangentVector,
    escape_rate: f64,  // how fast affinity drops along this geodesic
    
    // The key prediction: which mutation corresponds to this escape route
    predicted_mutation: Option<TargetMutation>,
}
```

### 9.2 Tests

```
TEST 7.1 — Known Resistance Recovery
  GIVEN: imatinib bound to BCR-ABL kinase
  THEN:  holonomy computation predicts T315I mutation as primary escape route
  KNOWN ANSWER: T315I ("gatekeeper mutation") is the most clinically
                significant imatinib resistance mutation
  VALIDATION: T315I appears in top-3 predicted escape geodesics

TEST 7.2 — Holonomy Group Closure
  GIVEN: holonomy group Hol(∇)
  THEN:  Hol(∇) is a Lie subgroup of the structure group G
  VALIDATION: algebraic closure (product of holonomies is a holonomy)

TEST 7.3 — Flat Connection → No Resistance
  GIVEN: drug with F_∇ = 0 (hypothetical perfect drug)
  THEN:  Hol(∇) = {identity} (trivial holonomy, no resistance)
  VALIDATION: Ambrose-Singer theorem: holonomy is generated by curvature

TEST 7.4 — Resistance Mutation Accessibility
  GIVEN: predicted resistance mutation with ΔΔG_folding > 5 kcal/mol
  THEN:  resistance_probability is low (mutation destabilizes target)
  VALIDATION: highly destabilizing mutations are selected against
              even if they confer resistance

TEST 7.5 — HERALD Handoff
  GIVEN: HERALD detects curvature anomaly in viral sequence space
  THEN:  the anomaly corresponds to a predicted escape geodesic in MIRADOR
  VALIDATION: HERALD's surveillance signal feeds directly into
              MIRADOR's resistance prediction module
  INTEGRATION: this is the HERALD↔MIRADOR bridge

TEST 7.6 — Counter-Strategy Coherence Recovery
  GIVEN: resistance mutation that drops C below threshold
  THEN:  minimum_pharmacophore_perturbation raises C back above threshold
  VALIDATION: the adapted drug (next-gen inhibitor) recovers coherence
  KNOWN ANSWER: ponatinib recovers activity against T315I BCR-ABL
```

### 9.3 Mathematical Validation

**V7.1**: By the Ambrose-Singer theorem, the Lie algebra of Hol(∇) is generated by all curvature values F_∇(X, Y) for tangent vectors X, Y. This means: the set of possible resistance mutations is determined by the curvature of the therapeutic connection. More curvature = more ways to escape = more resistance mutations.

**V7.2**: Escape geodesics are the integral curves of the eigenvectors of F_∇ with largest eigenvalue. The target "escapes" along the direction of maximum curvature — the direction where binding affinity changes most rapidly.

## 10. Layer 8: Combination Therapy

### 10.0 Mathematical Object

Multiple drugs acting together are sections of the tensor product bundle **E₁ ⊗ E₂ → T**.

### 10.1 Data Structures

```rust
/// Combination therapy as tensor product of therapeutic bundles
struct CombinationTherapy {
    individual_drugs: Vec<TherapeuticSection>,
    
    // Tensor product bundle
    tensor_bundle: TensorProductBundle,
    
    // Interaction classification
    interaction_type: InteractionType,
    
    // Combined coherence
    combined_coherence: f64,
}

enum InteractionType {
    /// F(E₁⊗E₂) < F(E₁) + F(E₂) : curvature coupling is favorable
    Synergy { bliss_independence_delta: f64 },
    /// F(E₁⊗E₂) > F(E₁) + F(E₂) : curvature coupling is unfavorable
    Antagonism { bliss_independence_delta: f64 },
    /// F(E₁⊗E₂) = F(E₁) + F(E₂) : flat tensor connection
    Additivity,
}
```

### 10.2 Tests

```
TEST 8.1 — Synergy Detection
  GIVEN: trimethoprim + sulfamethoxazole (co-trimoxazole)
  THEN:  InteractionType = Synergy
  KNOWN ANSWER: these are synergistic (sequential folate pathway blockade)
  VALIDATION: combined_coherence > max(C_trimethoprim, C_sulfa)

TEST 8.2 — Antagonism Detection
  GIVEN: bacteriostatic + bactericidal combination (e.g., tetracycline + penicillin)
  THEN:  InteractionType = Antagonism
  KNOWN ANSWER: bacteriostatic drugs reduce efficacy of bactericidal drugs
                by slowing bacterial growth (which penicillin requires)
  VALIDATION: combined_coherence < min(C_tet, C_penicillin)

TEST 8.3 — Tensor Product Curvature Bound
  GIVEN: two drugs with curvatures K₁, K₂
  THEN:  K(E₁⊗E₂) ≤ K₁ + K₂ + |interaction_term|
  VALIDATION: total curvature is bounded by sum plus interaction

TEST 8.4 — Combination Pareto Front
  GIVEN: N candidate drugs for the same target
  THEN:  the optimal combination lies on the Pareto front of
         (combined_coherence, number_of_drugs) space
  VALIDATION: adding more drugs beyond the Pareto optimum
              does not improve coherence

TEST 8.5 — DDI Curvature Interaction
  GIVEN: drug A is CYP3A4 inhibitor, drug B is CYP3A4 substrate
  THEN:  K_met(B | A present) > K_met(B alone)
         because A increases B's metabolic curvature
  KNOWN ANSWER: ketoconazole (CYP3A4 inhibitor) increases
                midazolam (CYP3A4 substrate) exposure 10-15×
  VALIDATION: K_met increase matches observed AUC ratio
```

## 11. Layer 9: Dosing Schedule

### 11.0 Mathematical Object

The dose-response curve is parallel transport of the therapeutic section along a concentration geodesic **c(t)**.

### 11.1 Data Structures

```rust
/// Dosing as parallel transport
struct DosingSchedule {
    // Drug from Layer 6
    drug: TherapeuticSection,
    
    // Patient from Layer 0
    patient: PatientManifold,
    
    // Pharmacokinetic trajectory
    concentration_curve: ConcentrationCurve,
    
    // Dosing parameters
    dose_amount: f64,       // mg
    dose_interval: f64,     // hours
    route: RouteOfAdmin,
    formulation: Formulation,
    
    // Derived quantities
    ec50: f64,              // conjugate point on concentration geodesic
    therapeutic_window: (f64, f64),  // (C_min_effective, C_max_safe)
    steady_state_time: f64,  // time to reach steady state
    
    // Patient-specific PK parameters
    clearance: f64,         // L/hr, patient-specific from Layer 0
    volume_of_distribution: f64,  // L, patient-specific
    half_life: f64,         // hours, derived
}

/// Concentration as a function of time
struct ConcentrationCurve {
    // Parallel transport equation: ∇_c σ(t) = 0
    // Solution: σ(t) = P_{0→t} σ(0) · e^{-K_exc · t}
    
    /// Concentration at time t after dose
    fn concentration_at(&self, t: f64) -> f64;
    
    /// Time to reach minimum effective concentration
    fn time_to_onset(&self) -> f64;
    
    /// Time above minimum effective concentration per dose interval
    fn time_in_therapeutic_window(&self) -> f64;
}
```

### 11.2 Tests

```
TEST 9.1 — Parallel Transport Consistency
  GIVEN: drug concentration c(t) and therapeutic section σ
  THEN:  ∇_c σ(t) = 0 (section is parallel-transported along concentration curve)
  VALIDATION: therapeutic effect at concentration c is determined by
              parallel transport from the reference state, not by
              local evaluation

TEST 9.2 — EC50 as Conjugate Point
  GIVEN: dose-response curve for a known drug
  THEN:  EC50 = conjugate point on the concentration geodesic
  KNOWN ANSWER: EC50 values from published dose-response data
  TOLERANCE: predicted EC50 within 3× of experimental value

TEST 9.3 — Patient-Specific PK
  GIVEN: same drug, patient with renal impairment (eGFR < 30)
  THEN:  clearance is reduced → half_life increases → dose interval increases
  KNOWN ANSWER: renal dosing adjustments for aminoglycosides
  VALIDATION: predicted dose adjustment matches clinical guidelines

TEST 9.4 — Steady State Prediction
  GIVEN: repeated dosing at interval τ_dose
  THEN:  steady_state_time ≈ 4-5 × half_life
  VALIDATION: standard pharmacokinetic result

TEST 9.5 — Formulation as Geodesic Reparametrization
  GIVEN: immediate-release vs sustained-release formulation of same drug
  THEN:  both have same total AUC but different concentration_curve shapes
  VALIDATION: AUC(IR) = AUC(SR) within 10%
              C_max(SR) < C_max(IR)
              T_max(SR) > T_max(IR)

TEST 9.6 — Therapeutic Window Constraint
  GIVEN: dosing schedule
  THEN:  time_in_therapeutic_window / dose_interval > 0.8
  VALIDATION: drug spends at least 80% of each interval in
              the therapeutic window (between MEC and MTC)
```

## 12. Integration Tests

These tests verify coherence between layers.

```
INTEGRATION TEST I.1 — Full Pipeline Smoke Test
  GIVEN: disease = Type 2 Diabetes, target = DPP-4
  THEN:  pipeline produces candidate in neighborhood of sitagliptin
  VALIDATION: recovered molecule has DPP-4 pharmacophore,
              acceptable ADMET, and correct dosing range

INTEGRATION TEST I.2 — Patient Personalization End-to-End
  GIVEN: same disease (hypertension), two patients:
         Patient A: CYP2D6 normal, eGFR 90, age 40
         Patient B: CYP2D6 poor metabolizer, eGFR 45, age 75
  THEN:  pipeline produces DIFFERENT optimal therapies
  VALIDATION: Patient A may get metoprolol (CYP2D6 substrate)
              Patient B gets amlodipine (not CYP2D6-dependent, renal-safe)

INTEGRATION TEST I.3 — HERALD → MIRADOR Handoff
  GIVEN: HERALD flags novel influenza variant with hemagglutinin mutation
  THEN:  MIRADOR ingests the HERALD curvature anomaly as a target constraint
         and produces candidate antivirals / vaccine antigens
  VALIDATION: HERALD output format is compatible with MIRADOR Layer 1 input

INTEGRATION TEST I.4 — Resistance → Redesign Loop
  GIVEN: initial drug m₁ with C₁ = τ₁/K₁
         resistance mutation detected by Layer 7
  THEN:  Layer 7 feeds back to Layer 6, which produces m₂ with C₂ > C_threshold
         against the resistant target
  VALIDATION: C₂(resistant target) > C_threshold
              m₂ retains activity against original target (C₂(original) > C₁ × 0.5)

INTEGRATION TEST I.5 — Coherence Conservation Across Layers
  GIVEN: molecule m passing through all layers
  THEN:  C computed at Layer 6 is consistent with τ from Layer 4 and K from Layer 5
         C = τ/K holds exactly (not approximately)
  VALIDATION: no coherence is lost or gained between layers

INTEGRATION TEST I.6 — Double Cover Across Agonist/Antagonist
  GIVEN: target with both agonist and antagonist clinical need
  THEN:  optimization produces two molecules m_agon and m_antag
         with E(m_agon) + T(m_agon)² ≤ 1 AND E(m_antag) + T(m_antag)² ≤ 1
         and τ_chiral(m_agon) = -τ_chiral(m_antag)
  VALIDATION: agonist/antagonist pair lives on opposite sheets
              of the Double Cover
```

## 13. Implementation Roadmap

### Phase 1: Foundation (Layers 0, 1, 2)

Build the three manifolds independently. Validate metric properties. Ingest real data.

**Rust crates**: `mirador-core`, `mirador-patient`, `mirador-target`, `mirador-candidate`
- Implement `RiemannianManifold` trait in `mirador-core` with `metric_at()`, `exp_map()`, `geodesic_distance()`, `sectional_curvature()`
- `mirador-patient`: PatientState struct, Fisher-Rao metric on microbiome simplex, Mahalanobis metric on phenomic fiber, pharmacogenomic fiber with CYP activity scores
- `mirador-target`: Conformation3D, Boltzmann-weighted RMSD metric, transition matrix with detailed balance validation, MD ensemble loader
- `mirador-candidate`: Molecule struct, Wasserstein molecular metric, Lipinski boundary as compact submanifold, latent space encoder/decoder bridge

**Python modules** (`mirador-py` PyO3 bridge):
- `mirador_ingest`: PharmGKB parser (pharmacogenomic variants), PDB/mmCIF parser (protein conformations), AlphaFold REST client, ZINC/ChEMBL loaders
- `mirador_rdkit`: SMILES ↔ 3D coordinate conversion, pharmacophore feature detection, molecular fingerprints

**Data sources**: PharmGKB, UK Biobank, PDB, AlphaFold DB, ZINC, ChEMBL
**Tests**: `cargo test` for all metric properties (symmetry, positive-definiteness, triangle inequality) + Python validation suite
**Deliverable**: three validated manifold crates with passing unit tests and Python data pipeline

### Phase 2: Bundle Construction (Layers 3, 4, 5)

Build the fiber bundle, extract pharmacophores, compute ADMET curvature.

**Rust crates**: `mirador-bundle`, `mirador-pharmacophore`, `mirador-admet`
- `mirador-bundle`: FiberBundle struct with local trivializations, transition functions (cocycle condition enforced at construction), therapeutic connection, curvature tensor F_∇. Structure group SE(3) × T^k via `nalgebra` Lie group support
- `mirador-pharmacophore`: Persistent homology via Rust-native Rips complex (or FFI to Ripser). Betti number extraction, Künneth decomposition τ = τ_bind · τ_chiral · τ_ring
- `mirador-admet`: ADMET curvature components K_abs through K_tox. Lipinski as curvature bound. CYP450 holonomy operators. Patient-specific modulation from Layer 0

**Python modules**:
- `mirador_ml`: Pretrained ADMET predictors (pkCSM, ADMETlab2) wrapped as Python callables, exposed to Rust via PyO3

**Deliverable**: therapeutic bundle crate with verified cocycle condition, pharmacophore extraction with known-answer tests, ADMET curvature matching Lipinski and beyond

### Phase 3: Optimization Engine (Layer 6)

Riemannian optimization on the candidate manifold. This is the core engine — pure Rust, no Python dependency.

**Rust crate**: `mirador-optimizer`
- Riemannian gradient ascent: grad_M C = (K·∇τ − τ·∇K) / K²
- Retraction map (project back onto M after gradient step)
- Vector transport (momentum across curved manifold)
- Pareto front computation in (τ, K) space
- Double Cover constraint enforcement: E + T² ≤ 1
- GPU acceleration via `wgpu` for parallel coherence evaluation across candidate populations

**Tests**: known-drug recovery (given HIV protease target → recover neighborhood of saquinavir), gradient finite-difference validation, monotonicity
**Deliverable**: optimizer that recovers known drugs from target specification, with GPU-accelerated candidate evaluation

### Phase 4: Prediction & Combination (Layers 7, 8, 9)

Resistance prediction, combination therapy, dosing. All Rust.

**Rust crates**: `mirador-resistance`, `mirador-combination`, `mirador-dosing`
- `mirador-resistance`: Curvature operator eigendecomposition for escape geodesics, holonomy group computation via Ambrose-Singer, resistance mutation ranking by eigenvalue
- `mirador-combination`: Tensor product bundle E₁ ⊗ E₂, interaction curvature [A₁, A₂], synergy/antagonism classifier, Bliss independence as flat connection
- `mirador-dosing`: One-compartment and two-compartment PK models as parallel transport, patient-specific clearance/Vd from Layer 0, EC50 as conjugate point, steady-state solver, therapeutic window optimizer

**Deliverable**: full pipeline from diagnosis to personalized prescription, all in Rust

### Phase 5: 3D Visualization Frontend

Real-time 3D visualization of disease targets and candidate therapeutics. This is MIRADOR's primary user interface — clinicians and researchers see the disease and the medicine, not spreadsheets.

**Stack**: React + TypeScript + Three.js (React Three Fiber) + WebGPU shaders
**Data bridge**: Rust → JSON/bincode via `serde` → WebSocket to frontend

**5.1 Molecular Structure Viewer**

The centerpiece. Two panels, side by side:

**Left panel — Disease Target:**
- 3D rendering of the target protein/RNA/DNA structure
- Backbone trace (ribbon diagram for proteins, sugar-phosphate backbone for nucleic acids)
- Binding pocket highlighted with translucent surface mesh
- Curvature heatmap overlay: regions of high F_∇ glow warm (red/orange), regions of low curvature glow cool (blue/green)
- Conformational ensemble animation: cycle through Boltzmann-weighted conformations in real time, showing how the target breathes
- For RNA/DNA targets: base-pair hydrogen bonds rendered as dashed lines, major/minor groove highlighted, secondary structure (stems, loops, bulges) color-coded
- Mutation sites (from HERALD input or resistance prediction) pulsed as glowing markers

**Right panel — Candidate Therapeutic:**
- 3D rendering of the candidate molecule in its binding pose
- Pharmacophore features rendered as colored spheres: H-bond donors (blue), H-bond acceptors (red), hydrophobic regions (yellow), aromatic rings (purple), charge centers (green/orange)
- Van der Waals surface with electrostatic potential coloring (red = negative, blue = positive)
- Binding interaction lines: dashed lines connecting pharmacophore features to their target contacts
- Chirality indicator: R/S label with orientation arrow

**Combined view — Binding Interaction:**
- Superimpose target and drug in the binding pocket
- Render pharmacophore-target contacts as spring-like connections
- Animate binding: molecule approaches target along the geodesic, settles into binding pose
- Off-target curvature rendered as faint tendrils extending from the drug toward non-target directions (visual encoding of F_∇ leakage)

**5.2 Sequence Viewer**

For nucleic acid targets (RNA viruses, DNA-targeted therapies, gene therapy):

- Linear sequence view with secondary structure annotation (dot-bracket notation rendered as arcs)
- 3D structure synchronized: clicking a nucleotide in the sequence highlights it in the 3D view and vice versa
- Mutation heatmap: color each position by HERALD curvature anomaly score
- Codon-level view for protein-coding regions: amino acid translation shown below
- CRISPR guide overlay (for gene therapy targets): guide RNA alignment shown with mismatch highlighting

**5.3 Coherence Dashboard (HUD)**

Heads-up display overlaid on the 3D view:

- **C = τ/K gauge**: large circular gauge showing current coherence, with τ and K broken out as sub-gauges
- **τ decomposition**: τ_bind, τ_chiral, τ_ring shown as stacked bars
- **K decomposition**: K_abs, K_dist, K_met, K_exc, K_tox shown as stacked bars (color-coded: green = low, yellow = medium, red = high)
- **Double Cover indicator**: E + T² plotted on a unit circle; current molecule shown as a point; agonist/antagonist regions labeled
- **Patient context**: compact display of the patient's pharmacogenomic status, organ function, and how they modulate K
- **Resistance radar**: eigenvalue spectrum of the curvature operator rendered as a radar chart; each spoke is an escape direction; spoke length = vulnerability

**5.4 Pipeline Visualization**

Layer-by-layer view of the MIRADOR pipeline:

- 10 nodes (Layers 0–9) connected by edges showing data flow
- Each node shows its mathematical object as a thumbnail (manifold, bundle, curvature tensor, etc.)
- Active layer highlighted; click to drill into that layer's 3D view
- Backpropagation arrows shown when constraints flow from later layers to earlier layers
- Coherence conservation check: C = τ/K displayed at each layer; if exact, shown in green

**5.5 Rendering Technology**

- **Molecular rendering**: instanced sphere rendering for atoms (GPU-instanced via Three.js InstancedMesh), tube geometry for bonds and backbone
- **Surface rendering**: marching cubes for van der Waals and electrostatic surfaces, computed on GPU via WebGPU compute shaders
- **Curvature visualization**: custom WGSL shaders that map scalar curvature values to a perceptually uniform colormap (viridis or inferno)
- **Performance target**: 60fps for structures up to 10,000 atoms; 30fps for structures up to 50,000 atoms; LOD (level of detail) switching for larger structures
- **Data streaming**: Rust backend streams conformational ensemble frames via WebSocket; frontend interpolates between frames for smooth animation

### Phase 6: HERALD Integration

Connect HERALD's surveillance output to MIRADOR's target input. Close the loop: detect threat → design response.

**Deliverable**: end-to-end pandemic response pipeline with 3D visualization of the emerging threat and the designed therapeutic response

## 14. Provisional Patent Claims

**Claim 1**: A method for designing therapeutic molecules by optimizing coherence C = τ/K on a Riemannian fiber bundle, where τ is the pharmacophore topological invariant and K is the ADMET curvature tensor.

**Claim 2**: A patient-specific drug design method in which the ADMET curvature K is modulated by a patient manifold (P, g_P) encoding genomic, phenomic, microbiome, and immune coordinates.

**Claim 3**: A drug resistance prediction method based on computing the holonomy group Hol(∇) of the therapeutic connection and identifying escape geodesics as eigenvectors of the curvature tensor F_∇.

**Claim 4**: A combination therapy optimization method based on computing the curvature of the tensor product bundle E₁ ⊗ E₂ and classifying drug-drug interactions as synergy (sub-additive curvature), antagonism (super-additive curvature), or additivity (flat tensor connection).

**Claim 5**: An integrated surveillance-to-therapy pipeline in which a pathogen surveillance system (HERALD) detects curvature anomalies in sequence space and transmits them as target constraints to a therapeutic design system (MIRADOR).

**Claim 6**: A dosing schedule computation method based on parallel transport of a therapeutic section along a patient-specific concentration geodesic, with EC50 identified as the conjugate point.

**Claim 7**: A real-time 3D visualization system for therapeutic design in which disease target structures (protein, RNA, DNA) and candidate therapeutic molecules are rendered simultaneously with curvature heatmap overlays encoding off-target activity (F_∇), pharmacophore-target contact mapping, and a coherence dashboard displaying C = τ/K with decomposed τ and K components.

## 15. Mathematical Dependency Chain

```
Davis Field Equations (C = τ/K)
  ├── Branch I: Plasma Stability (CHIHIRO)
  ├── Branch II: Viral Surveillance (HERALD)
  ├── Branch VII: Cognitive Geometry (LEXICON, Marcella)
  ├── Branch IX: Smooth 4D Poincaré
  ├── Branch X: Variable Light Speed
  └── Branch XI: Therapeutic Geometry (MIRADOR)  ← THIS DOCUMENT
        ├── Fiber Bundle Theory (Layers 3, 7, 8)
        ├── Riemannian Optimization (Layer 6)
        ├── Persistent Homology (Layer 4)
        ├── Double Cover Principle (Layer 6, Test 6.7)
        ├── Holonomy Theory (Layer 7)
        ├── Parallel Transport (Layer 9)
        └── 3D Visualization (Phase 5: target + therapeutic + curvature rendering)
```

Every layer of MIRADOR is a specialization of C = τ/K to a specific biological manifold. The equation does not change. The manifold changes. The medicine follows.
