import { ReactElement, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { EditorRefApi, useEditorMarkings } from "@plane/document-editor";
import { TPage } from "@plane/types";
import { Spinner, TOAST_TYPE, setToast } from "@plane/ui";
// components
import { PageHead } from "@/components/core";
import { PageDetailsHeader } from "@/components/headers/page-details";
import { IssuePeekOverview } from "@/components/issues";
import { PageEditorBody, PageEditorHeaderRoot } from "@/components/pages";
// hooks
import { usePage, useProjectPages } from "@/hooks/store";
import { AppLayout } from "@/layouts/app-layout";
import { NextPageWithLayout } from "@/lib/types";

const PageDetailsPage: NextPageWithLayout = observer(() => {
  // states
  const [sidePeekVisible, setSidePeekVisible] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const [readOnlyEditorReady, setReadOnlyEditorReady] = useState(false);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  const readOnlyEditorRef = useRef<EditorRefApi>(null);
  // router
  const router = useRouter();
  const { projectId, pageId } = router.query;
  // store hooks
  const { createPage, getPageById } = useProjectPages(projectId?.toString() ?? "");
  const pageStore = usePage(pageId?.toString() ?? "");
  // editor markings hook
  const { markings, updateMarkings } = useEditorMarkings();
  // form info
  const { handleSubmit, getValues, control } = useForm<TPage>({
    defaultValues: {
      name: "",
      description_html: "",
    },
  });

  useEffect(
    () => () => {
      if (pageStore.cleanup) pageStore.cleanup();
    },
    [pageStore]
  );

  const handleEditorReady = (value: boolean) => setEditorReady(value);

  const handleReadOnlyEditorReady = () => setReadOnlyEditorReady(true);

  // fetching page details
  useSWR(pageId ? `PAGE_DETAILS_${pageId}` : null, pageId ? () => getPageById(pageId.toString()) : null);

  if (!pageStore || !pageStore.id)
    return (
      <div className="h-full w-full grid place-items-center">
        <Spinner />
      </div>
    );

  // we need to get the values of title and description from the page store but we don't have to subscribe to those values
  const pageTitle = pageStore?.name;

  const handleCreatePage = async (payload: Partial<TPage>) => await createPage(payload);

  const handleUpdatePage = async (formData: TPage) =>
    pageStore.updateDescription(formData.description_html ?? "<p></p>");

  const handleDuplicatePage = async () => {
    const currentPageValues = getValues();

    if (!currentPageValues?.description_html) {
      // TODO: We need to get latest data the above variable will give us stale data
      currentPageValues.description_html = pageStore.description_html;
    }

    const formData: Partial<TPage> = {
      name: "Copy of " + pageStore.name,
      description_html: currentPageValues.description_html,
    };

    await handleCreatePage(formData).catch(() =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Page could not be duplicated. Please try again later.",
      })
    );
  };

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full flex-col justify-between">
        <div className="h-full w-full flex-shrink-0 flex flex-col overflow-hidden">
          {projectId && (
            <PageEditorHeaderRoot
              editorRef={editorRef}
              readOnlyEditorRef={readOnlyEditorRef}
              editorReady={editorReady}
              readOnlyEditorReady={readOnlyEditorReady}
              handleDuplicatePage={handleDuplicatePage}
              markings={markings}
              pageStore={pageStore}
              projectId={projectId.toString()}
              sidePeekVisible={sidePeekVisible}
              setSidePeekVisible={(state) => setSidePeekVisible(state)}
            />
          )}
          <PageEditorBody
            control={control}
            editorRef={editorRef}
            handleEditorReady={handleEditorReady}
            readOnlyEditorRef={readOnlyEditorRef}
            handleReadOnlyEditorReady={handleReadOnlyEditorReady}
            handleSubmit={() => handleSubmit(handleUpdatePage)()}
            markings={markings}
            pageStore={pageStore}
            sidePeekVisible={sidePeekVisible}
            updateMarkings={updateMarkings}
          />
          <IssuePeekOverview />
        </div>
      </div>
    </>
  );
});

PageDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return (
    <AppLayout header={<PageDetailsHeader />} withProjectWrapper>
      {page}
    </AppLayout>
  );
};

export default PageDetailsPage;
