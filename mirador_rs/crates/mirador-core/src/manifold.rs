/// The Riemannian manifold trait.
///
/// Every geometric object in MIRADOR (patient manifold, target manifold,
/// candidate manifold) implements this trait.  The trait is intentionally
/// minimal — it only requires what the Davis Field Equation C = τ/K needs.
pub trait RiemannianManifold {
    /// Dimension of the manifold.
    fn dim(&self) -> usize;

    /// Riemannian distance between two points (coordinates as slices).
    ///
    /// Must satisfy:
    ///   - d(x, x) = 0
    ///   - d(x, y) = d(y, x)
    ///   - d(x, z) ≤ d(x, y) + d(y, z)
    fn distance(&self, x: &[f64], y: &[f64]) -> f64;

    /// Inner product g(v, w) at base point x.
    fn inner_product(&self, x: &[f64], v: &[f64], w: &[f64]) -> f64;

    /// Norm of a tangent vector: ‖v‖ = √g(v, v).
    fn norm(&self, x: &[f64], v: &[f64]) -> f64 {
        self.inner_product(x, v, v).sqrt()
    }
}
