# MIRADOR: Manifold of Immune Receptors And Drift-Optimized Responses — Geometry-First Co-Embedding for Vaccine and Antibody Design

**Author:** Bee Rosa Davis  
**ORCID:** [0009-0009-8034-4308](https://orcid.org/0009-0009-8034-4308)  
**Contact:** bee_davis@alumni.brown.edu  
**Patent notice:** Subject matter herein may relate to US Provisional Patent Application No. 64/012,328.  
**Date:** March 2026  
**Type:** Conceptual / theoretical manuscript (arXiv preprint)

---

## Description

This manuscript introduces **MIRADOR** (*Manifold of Immune Receptors And Drift-Optimized Responses*), a geometry-first theoretical framework for certifiably-robust vaccine and antibody panel design. MIRADOR is the design-side complement to HERALD (the surveillance system), completing the Davis geometric programme: where HERALD bounds the *risk of detection failure*, MIRADOR bounds the *probability of design success*. Instead of propagating errors forward into a risk estimate, MIRADOR **inverts the error budget** — specifying, for any target neutralization coverage level, the exact empirical hurdle a candidate panel must clear to earn a certified lower bound.

The central object is a **mirror manifold pair** (𝑀_A, 𝑀_R): a Davis-structured antigen manifold tracking viral drift, co-embedded in shared ambient Euclidean space with a complementary receptor manifold encoding the antibody/BCR design space. The two manifolds are coupled by an asymmetric contrastive training objective that enforces **lock-and-key geometry** — receptor embeddings act as Platonic antigen centroids — and by a calibrated binding-energy functional linking geometric distance to Gibbs free energy. Coverage of a receptor panel against forecasted antigenic drift is then a geometric path-interception problem on a Riemannian manifold, and MIRADOR provides analytically grounded, explicitly auditable **coverage certificates** for any proposed panel.

---

## Headline Results

### 1. Compositional Coverage Bound (Theorem 5.1)

The main theorem provides a high-probability lower bound on the **true neutralization coverage** C_neut(V; L) of any receptor panel V at drift horizon L:

**Additive form:**
$$C_\text{neut}(V;L) \;\geq\; \bigl[\hat{C}(V;L) - \varepsilon_\text{samp}\bigr]_+ \;-\; \bigl(E_\text{geom} + E_\text{bind} + E_\text{link}\bigr)$$

**Multiplicative form:**
$$C_\text{neut}(V;L) \;\geq\; \bigl[\hat{C}(V;L) - \varepsilon_\text{samp}\bigr]_+ \cdot \bigl[(1-E_\text{geom})(1-E_\text{bind})(1-E_\text{link}) - \delta^\text{cov}_\text{indep}\bigr]$$

where:
- $\hat{C}(V;L)$ is the empirical Monte Carlo coverage over sampled drift paths
- $\varepsilon_\text{samp} = \sqrt{\frac{1}{2B}\log\frac{2}{\delta_\text{samp}}}$ is a Hoeffding sampling tolerance (B paths, confidence $1-\delta_\text{samp}$)
- $E_\text{geom}$, $E_\text{bind}$, $E_\text{link}$ are pre-registered upper bounds on geometric, binding-model, and binding–neutralisation linkage failure probabilities
- $\delta^\text{cov}_\text{indep}$ is a novel **coverage independence slack** capturing correlated failure between error modes

The bound is one-sided, non-vacuous when error budgets are small relative to empirical coverage, and collapses to zero gracefully when assumptions fail — forcing abstention rather than false confidence.

### 2. Inverted Error Budget (Proposition 5.2)

Any panel V whose Monte Carlo coverage clears the threshold
$$\hat{C}_\text{min}(C_\star) \;=\; C_\star + \varepsilon_\text{samp} + \bar{E}_\text{geom} + \bar{E}_\text{bind} + \bar{E}_\text{link}$$
is provably $C_\star$-certified. This **inverts** the classical error-budget view: instead of propagating model errors onto a risk estimate, MIRADOR back-computes exactly how high mock empirical coverage must be for a design to be certifiable at any target level. This is the analogue of type-II error control for vaccine design.

### 3. Existence of Receptor Mirror Geometry (Theorem 3.1)

Under four regularity assumptions (antigen-side Davis structure, receptor smoothness and distortion control, positive binding margin $\Delta_\text{bind} > 0$, and path-support in-distribution), the composite training loss — asymmetric InfoNCE + lock-and-key center-of-mass loss + Davis-style smoothness regulariser — is shown to yield a receptor manifold (𝑀_R, g_R) and complementary co-embedding (u_A, u_R) satisfying:
1. Davis manifold conditions (bounded distortion, non-vacuous margins) on the receptor side
2. Lock-and-key semantics (u_R(r) near center-of-mass of cognate antigens) on the binding in-distribution region Ω_bind
3. Well-posed pathwise hit events and coverage functionals C(V; L)
4. Euclidean surrogacy: geodesic computations are well-approximated by ambient L2 distances within the validated regime

### 4. Vaccine Design as a Constrained Coverage Problem

Vaccine design is formalised as:
$$\text{find } V \in \mathcal{V} \quad \text{such that} \quad \underline{C}_\text{neut}(V; L^\star_A) \geq C_\star$$
with greedy and relaxed mirror-space algorithms (submodular maximisation, Riemannian gradient ascent, sequence-space projection) providing tractable solutions, accompanied by an analysis of certificate-preserving approximation ratios. Joint vaccine + therapeutic cocktail design is handled via inclusion–exclusion on the joint hit event.

---

## Novel Mathematical Contributions

| Contribution | Description |
|---|---|
| **Mirror manifold pair** (𝑀_A, 𝑀_R) | Two coupled Davis-structured Riemannian manifolds in shared ambient ℝ^d; novel in enforcing complementary (lock-and-key) rather than similarity geometry |
| **Complementary co-embedding** | Asymmetric InfoNCE training with three negative pools (non-cognate, mismatched, null-binding) preventing centroid collapse; center-of-mass alignment as a co-training objective |
| **Inverted error budget** | First formulation of vaccine panel certification as an inverted coverage inequality; analogous to non-inferiority margins but geometrically grounded |
| **Coverage independence slack** $\delta^\text{cov}_\text{indep}$ | Measures the shortfall between the product of marginal good-event probabilities and the joint good-event probability; interpolates between union-bound (additive) and independence (multiplicative) regimes |
| **Binding–neutralisation linkage term** $E_\text{link}$ | Explicitly budgets the biological gap between binding-model hit events and true neutralisation, making the certificate honest about the theory–experiment interface |
| **Pathwise coverage functional** $C(V;L)$ | Coverage defined over path *distributions* on a Riemannian manifold, not pointwise antigen sets; enables principled reasoning about temporal drift trajectories |
| **Mirror-aware affinity maturation** | Riemannian exponential map updates on 𝑀_R for *in silico* maturation: geodesic steps toward high-affinity mirror-space regions, followed by sequence-space projection |
| **Dual-use firewall architecture** | Categorical prohibition of inverse queries (receptor → worst-case antigen) at the architectural level; panel-level hedging enforced as a mathematical constraint (minimum panel size, diversity margins) |

---

## Historical and Intellectual Context

MIRADOR sits at the intersection of several streams of geometric methodology in structural biology and immunology. The field's history of bringing Riemannian and manifold-based thinking to molecular problems is long; the framework below represents the logical culmination of those threads.

### Antigenic Cartography (Smith et al., 2004)
The foundational geometric insight for viral immunology: Smith et al. (*Science* 2004) used multidimensional scaling of haemagglutination-inhibition titres to embed influenza strains in 2D antigenic maps, showing that antigenic distance predicts vaccine cross-reactivity better than genetic distance. This established the principle that immunological relevance is a *geometric* property in a latent space, not directly a sequence-space property. MIRADOR generalises this from static snap-shots to dynamic path-families on Riemannian manifolds.

### Riemannian Geometry in Protein Structure
Normal mode analysis, principal component analysis of molecular dynamics trajectories (Amadei et al., 1993; García, 1992), and Ramachandran/torsion-angle manifolds all treated protein conformation as a low-dimensional curved space. The pullback metric construction in MIRADOR descends from this tradition: the ambient Euclidean metric on embedding space induces a Riemannian metric on the manifold image, and path-length in that metric captures biologically meaningful notions of structural change.

### Information Geometry in Statistical Immunology
Amari's information geometry (1985, 2016) — the application of Fisher information metrics to statistical manifolds — found application in repertoire analysis and clonal evolution models. The distortion profile ε_A(L) in the Davis framework is spiritually related to the Fisher information geodesic length, bounding how far a sequence can travel while remaining "the same antigen" in terms of immune recognition.

### Metric Learning and Contrastive Objectives for Molecular Systems
Siamese networks and triplet-loss metric learning (Bromley et al., 1994; Hoffer & Ailon, 2015) were adapted to molecular fingerprints and binding prediction throughout the 2010s. The InfoNCE objective (Oord et al., 2018) and its asymmetric variants underpin MIRADOR's receptor encoder training. The key innovation here is the *asymmetric negative structure*: three distinct negative pools (non-cognate, mismatched-receptor, null-binding) prevent centroid collapse in a way that standard symmetric contrastive objectives cannot.

### Protein Language Models and Sequence Manifolds
ESM-1v, ESM-2 (Lin et al., 2023), ProtTrans (Elnaggar et al., 2022), and IgLM (Shuai et al., 2023) demonstrated that pre-trained transformer encoders on protein sequences induce representation spaces with strong geometric structure — fitness landscapes, evolutionary nearness, and structural similarity all manifest as local geometric properties. MIRADOR treats such encoder-induced spaces as candidate Davis manifolds, subjecting them to distortion audits rather than assuming their geometry is well-behaved.

### Geometric Deep Learning for Antibodies
ABodyBuilder2 (Abanades et al., 2023), ImmuneBuilder (Kenlay et al., 2023), and AbLang (Olsen et al., 2022) brought structure-aware modelling to antibody sequences. These provide the receptor manifold 𝑀_R its empirical backbone: receptor encoders trained on structure-conditioned data satisfy the smoothness and bounded-distortion conditions MIRADOR assumes, at least along biologically plausible affinity-maturation paths.

### Strain Selection and Breadth Optimisation
Łuksza & Lässig (2014, *Nature*) introduced fitness-model-based influenza strain selection for vaccine formulation. Conceptually, selecting K strains to maximise population-level cross-protection is the discrete precursor of MIRADOR's continuous coverage optimisation. MIRADOR upgrades this to a Riemannian set-cover problem with certified lower bounds, replacing heuristic cross-reactivity scores with geometrically grounded coverage certificates.

### Conformal and PAC-Bayes Coverage Guarantees
The Venn predictors and conformal prediction framework (Vovk et al., 2005; Angelopoulos & Bates, 2023) establishes finite-sample, distribution-free coverage guarantees for prediction sets. MIRADOR's Hoeffding-based sampling tolerance ε_samp and the one-sided certificate structure are in the same intellectual family — the difference being that the coverage object here is a path-family over a Riemannian manifold, not a scalar prediction interval.

### The Davis Manifold Framework and HERALD
The immediate predecessor is the Davis manifold framework (Davis, 2024–2025, manuscript series), which formalised the notion of a Riemannian state space for biological identity-preserving processes, equipped with benign path families, pathwise distortion profiles, configuration margins, and compositional error budgets. HERALD instantiated this for viral antigenic surveillance: an antigen-side Davis manifold with Cantelli-based dominance-risk bounds. MIRADOR completes the programme by constructing the receptor-side mirror and converting the error-budget machinery from forward risk propagation to inverted certification.

---

## Contents of This Deposit

| File | Description |
|---|---|
| `theory/mirador.tex` | Full LaTeX source (2,700+ lines) |
| `theory/mirador.pdf` | Compiled PDF (41 pages) |
| `MIRADOR_SPEC.md` | Implementation specification |
| `mirador_validation.py` | Validation harness (Python) |
| `mirador_validation_results.json` | Numerical validation output |

---

## Keywords

manifold learning · vaccine design · antibody engineering · Riemannian geometry · contrastive learning · coverage certificates · antigenic drift · error budgets · immune receptor · lock-and-key embedding · set cover · geometric deep learning · conformal prediction · Davis manifolds · HERALD · dual-use biosecurity

---

## Licence

© 2026 Bee Rosa Davis. All rights reserved.  
Commercial use of the methods described herein may require a licence from the patent holder.  
Non-commercial academic use is permitted with attribution.  
US Provisional Patent Application No. 64/012,328.
