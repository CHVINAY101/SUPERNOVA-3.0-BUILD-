import { CONFIG } from "@/config";

export const HomeTimeline = () => {
  const steps = [
    {
      era: "PAST",
      badgeColor: "#1719C9",
      title: "The Foundations",
      subtitle: "Decades of Academic Heritage",
      description:
        "The National Education Society of Karnataka was established with a mission to deliver holistic, value-based education. For generations, its institutions have cultivated visionary leaders, scientists, and educators in Karnataka.",
      accent: "1917–PRESENT",
    },
    {
      era: "PRESENT",
      badgeColor: "#E6007A",
      title: "Supernova 3.0",
      subtitle: CONFIG.DATES,
      description:
        "A vibrant two-day confluence of physical sciences, creative animation, esports competitions, and prototype showcases at The National College campus in Basavanagudi.",
      accent: "ACTIVE CONVERGENCE",
    },
    {
      era: "FUTURE",
      badgeColor: "#C8F500",
      title: "Shaping Tomorrow",
      subtitle: "The Next Era of Innovation",
      description:
        "Inspiring the next generation of creators, animators, and engineers with real-world skills, industry exposure, and creative confidence to solve global challenges.",
      accent: "BEYOND 2026",
    },
  ];

  return (
    <section className="section-padding bg-[#F8F7FC] border-y border-[#EAEAF2]">
      <div className="site-container">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-16">
          <span className="section-label">OUR JOURNEY</span>
          <h2 className="section-heading">From Heritage to Horizon</h2>
          <p className="section-subtitle">
            Connecting our rich academic heritage with the creative breakthroughs defining tomorrow's technology.
          </p>
        </div>

        {/* Timeline Row with Ribbon Connector */}
        <div className="relative">
          {/* Ribbon Connecting Line (Desktop) */}
          <div
            className="hidden md:block absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 z-0 rounded-full"
            style={{
              background: "linear-gradient(90deg, #1719C9 0%, #E6007A 50%, #C8F500 100%)",
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            {steps.map((step, idx) => (
              <div
                key={step.era}
                className="bg-white rounded-2xl p-8 border border-[#EAEAF2] shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="font-mono text-xs font-bold px-3 py-1 rounded-full uppercase"
                      style={{
                        backgroundColor: step.badgeColor === "#C8F500" ? "#C8F500" : step.badgeColor,
                        color: step.badgeColor === "#C8F500" ? "#151535" : "#FFFFFF",
                        border: step.badgeColor === "#C8F500" ? "1.5px solid #151535" : "none",
                      }}
                    >
                      {step.era}
                    </span>
                    <span className="font-heading font-bold text-sm text-[#52527A]">
                      0{idx + 1}
                    </span>
                  </div>

                  <h3 className="font-heading text-2xl font-bold text-[#151535] mb-1">
                    {step.title}
                  </h3>
                  <div className="text-sm font-semibold text-[#1719C9] mb-4">
                    {step.subtitle}
                  </div>
                  <p className="text-sm text-[#52527A] leading-relaxed">
                    {step.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#EAEAF2] flex items-center justify-between text-xs font-mono font-bold text-[#151535]">
                  <span>{step.accent}</span>
                  <span className="text-[#E6007A]">✦</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
