import { CONFIG } from "@/config";

export const HomeInstitutions = () => {
  return (
    <section className="section-padding bg-[#F8F7FC] border-y border-[#EAEAF2]">
      <div className="site-container">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-12">
          <span className="section-label">PARTNERS IN INNOVATION</span>
          <h2 className="section-heading">Organised With</h2>
          <p className="section-subtitle mb-0">
            Presented by <strong>{CONFIG.PRESENTER_LEAD}</strong> {CONFIG.PRESENTER_COLLAB}, bringing together our distinguished institutions across Bengaluru.
          </p>
        </div>

        {/* Two Campus Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {CONFIG.INSTITUTIONS.map((group) => (
            <div
              key={group.campus}
              className="bg-white rounded-2xl p-8 border border-[#EAEAF2] shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="inline-block px-3 py-1 bg-[#1719C9]/10 text-[#1719C9] font-bold text-xs uppercase tracking-wider rounded-full mb-4">
                  {group.campus}
                </div>
                <h3 className="font-heading text-xl font-bold text-[#151535] mb-4">
                  Participating Institutions
                </h3>
                <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                  {group.schools.map((school) => (
                    <li
                      key={school}
                      className="flex items-center gap-3 text-base font-medium text-[#2A2A54]"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#C8F500] border border-[#151535]" />
                      <span>{school}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-[#EAEAF2] text-xs font-semibold text-[#52527A] flex items-center justify-between">
                <span>Bengaluru, Karnataka</span>
                <span className="text-[#1719C9]">Academic Excellence</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
