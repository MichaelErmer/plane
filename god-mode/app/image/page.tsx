"use client";

import { observer } from "mobx-react-lite";
import useSWR from "swr";
// hooks
import useInstance from "hooks/use-instance";
// layouts
import { Loader } from "@plane/ui";
import { InstanceImageConfigForm } from "components/forms";
// types
// hooks
// ui
// components

const InstanceImagePage = observer(() => {
  // store
  const { fetchInstanceConfigurations, formattedConfig } = useInstance();

  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  return (
    <>
      <div className="flex flex-col gap-8">
        <div className="mb-2 border-b border-custom-border-100 pb-3">
          <div className="pb-1 text-xl font-medium text-custom-text-100">
            Third-party image libraries
          </div>
          <div className="text-sm font-normal text-custom-text-300">
            Let your users search and choose images from third-party libraries
          </div>
        </div>
        {formattedConfig ? (
          <InstanceImageConfigForm config={formattedConfig} />
        ) : (
          <Loader className="space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Loader.Item height="50px" />
              <Loader.Item height="50px" />
            </div>
            <Loader.Item height="50px" />
          </Loader>
        )}
      </div>
    </>
  );
});

export default InstanceImagePage;
